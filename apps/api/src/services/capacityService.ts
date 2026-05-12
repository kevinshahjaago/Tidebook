import { prisma } from "../db";
import { BookingStatus } from "@tidebook/shared";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "@tidebook/shared";

const ACTIVE_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

export interface CapacityCheckResult {
  capacityLimit: number;
  usedCapacity: number;
  remainingCapacity: number;
  isBlackout: boolean;
}

/**
 * Returns the effective daily capacity limit for a date.
 * Checks DailyCapacity override first, then falls back to the active season's default.
 */
export async function getEffectiveCapacityLimit(date: string): Promise<number> {
  const override = await prisma.dailyCapacity.findUnique({ where: { date } });
  if (override) return override.capacityLimit;

  const season = await prisma.season.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      isPublished: true,
    },
    orderBy: { startDate: "desc" },
  });

  return season?.defaultDailyCapacity ?? 300;
}

export async function checkDailyCapacity(
  date: string,
  groupSize: number
): Promise<CapacityCheckResult> {
  const override = await prisma.dailyCapacity.findUnique({ where: { date } });

  if (override?.isBlackout) {
    throw new AppError(ErrorCode.DATE_BLACKOUT, "This date is not available for visits", 409);
  }

  const capacityLimit = override?.capacityLimit ?? (await getEffectiveCapacityLimit(date));

  const usedCapacity = await getUsedCapacity(date);
  const remainingCapacity = capacityLimit - usedCapacity;

  if (remainingCapacity < groupSize) {
    throw new AppError(
      ErrorCode.CAPACITY_EXCEEDED,
      `Insufficient capacity on ${date}. Available: ${Math.max(0, remainingCapacity)}, requested: ${groupSize}`,
      409
    );
  }

  return { capacityLimit, usedCapacity, remainingCapacity, isBlackout: false };
}

export async function getUsedCapacity(date: string): Promise<number> {
  const [bookingResult, holdResult] = await Promise.all([
    prisma.booking.aggregate({
      where: { visitDate: date, status: { in: ACTIVE_STATUSES } },
      _sum: { studentCount: true, adultCount: true },
    }),
    prisma.slotHold.aggregate({
      where: { visitDate: date, expiresAt: { gt: new Date() } },
      _sum: { groupSize: true },
    }),
  ]);

  return (
    (bookingResult._sum.studentCount ?? 0) +
    (bookingResult._sum.adultCount ?? 0) +
    (holdResult._sum.groupSize ?? 0)
  );
}

export async function getDailyCapacityInfo(date: string): Promise<{
  capacityLimit: number;
  usedCapacity: number;
  remainingCapacity: number;
  isBlackout: boolean;
  note: string | null;
}> {
  const override = await prisma.dailyCapacity.findUnique({ where: { date } });
  const capacityLimit = override?.capacityLimit ?? (await getEffectiveCapacityLimit(date));
  const isBlackout = override?.isBlackout ?? false;
  const usedCapacity = isBlackout ? 0 : await getUsedCapacity(date);
  const remainingCapacity = Math.max(0, capacityLimit - usedCapacity);

  return {
    capacityLimit,
    usedCapacity,
    remainingCapacity,
    isBlackout,
    note: override?.note ?? null,
  };
}

export async function getAvailabilityCalendar(
  startDate: string,
  endDate: string,
  groupSize: number,
  limitedThreshold: number = 30
): Promise<
  Array<{
    date: string;
    capacityLimit: number;
    remainingCapacity: number;
    isBlackout: boolean;
    isAvailable: boolean;
    isLimitedAvailability: boolean;
  }>
> {
  // Get all overrides in range
  const overrides = await prisma.dailyCapacity.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
  });

  const overrideMap = new Map(overrides.map((o) => [o.date, o]));

  // Aggregate used capacity for all dates in range in a single query
  const [usageByDate, holdsByDate] = await Promise.all([
    prisma.booking.groupBy({
      by: ["visitDate"],
      where: { visitDate: { gte: startDate, lte: endDate }, status: { in: ACTIVE_STATUSES } },
      _sum: { studentCount: true, adultCount: true },
    }),
    prisma.slotHold.groupBy({
      by: ["visitDate"],
      where: { visitDate: { gte: startDate, lte: endDate }, expiresAt: { gt: new Date() } },
      _sum: { groupSize: true },
    }),
  ]);

  const holdMap = new Map(holdsByDate.map((h) => [h.visitDate, h._sum.groupSize ?? 0]));
  const usageMap = new Map(
    usageByDate.map((u) => [
      u.visitDate,
      (u._sum.studentCount ?? 0) + (u._sum.adultCount ?? 0) + (holdMap.get(u.visitDate) ?? 0),
    ])
  );

  // Get all seasons overlapping the requested range, with registration window info
  const now = new Date();
  const seasons = await prisma.season.findMany({
    where: {
      isPublished: true,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });

  // For each date, find an applicable season whose registration is currently open
  const openSeasonForDate = (date: string) =>
    seasons.find(
      (s) =>
        s.startDate <= date &&
        s.endDate >= date &&
        s.registrationOpensAt <= now &&
        s.registrationClosesAt >= now
    );

  // Build calendar
  const results: Array<{
    date: string;
    capacityLimit: number;
    remainingCapacity: number;
    isBlackout: boolean;
    isAvailable: boolean;
    isLimitedAvailability: boolean;
  }> = [];
  let current = startDate;
  while (current <= endDate) {
    const override = overrideMap.get(current);
    const isBlackout = override?.isBlackout ?? false;
    const matchedSeason = openSeasonForDate(current);
    const capacityLimit = override?.capacityLimit ?? (matchedSeason?.defaultDailyCapacity ?? 300);
    const usedCapacity = usageMap.get(current) ?? 0;
    const remainingCapacity = Math.max(0, capacityLimit - usedCapacity);

    // Unavailable if: blackout, no open season covers this date, or insufficient capacity
    const registrationOpen = !!matchedSeason;
    const isAvailable = !isBlackout && registrationOpen && remainingCapacity >= groupSize;
    const isLimitedAvailability =
      !isBlackout && registrationOpen && remainingCapacity > 0 && remainingCapacity < limitedThreshold;

    results.push({
      date: current,
      capacityLimit,
      remainingCapacity,
      isBlackout: isBlackout || !registrationOpen,
      isAvailable,
      isLimitedAvailability,
    });

    // Increment date
    const d = new Date(current + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }

  return results;
}
