import { getAvailabilityCalendar } from "../../services/capacityService";
import { prisma } from "../../db";

jest.mock("../../db", () => ({
  prisma: {
    dailyCapacity: { findMany: jest.fn() },
    booking: { groupBy: jest.fn() },
    season: { findFirst: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("getAvailabilityCalendar", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns available dates when capacity is sufficient", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue({ defaultDailyCapacity: 300 });

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-03", 50);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      date: "2026-03-01",
      capacityLimit: 300,
      remainingCapacity: 300,
      isBlackout: false,
      isAvailable: true,
      isLimitedAvailability: false,
    });
  });

  it("marks dates as unavailable when capacity is exceeded", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([
      { visitDate: "2026-03-01", _sum: { studentCount: 280, adultCount: 30 } },
    ]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue({ defaultDailyCapacity: 300 });

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-01", 50);

    expect(result[0].isAvailable).toBe(false);
    expect(result[0].remainingCapacity).toBe(0);
  });

  it("marks dates as limited when remaining is below threshold", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([
      { visitDate: "2026-03-01", _sum: { studentCount: 280, adultCount: 0 } },
    ]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue({ defaultDailyCapacity: 300 });

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-01", 10, 30);

    expect(result[0].isAvailable).toBe(true);
    expect(result[0].isLimitedAvailability).toBe(true);
    expect(result[0].remainingCapacity).toBe(20);
  });

  it("marks blackout dates as unavailable", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([
      { date: "2026-03-01", capacityLimit: 300, isBlackout: true, note: "Staff training" },
    ]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue({ defaultDailyCapacity: 300 });

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-01", 10);

    expect(result[0].isBlackout).toBe(true);
    expect(result[0].isAvailable).toBe(false);
  });

  it("respects per-date capacity overrides", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([
      { date: "2026-03-01", capacityLimit: 100, isBlackout: false, note: "Reduced" },
    ]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([
      { visitDate: "2026-03-01", _sum: { studentCount: 80, adultCount: 10 } },
    ]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue({ defaultDailyCapacity: 300 });

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-01", 20);

    expect(result[0].capacityLimit).toBe(100);
    expect(result[0].remainingCapacity).toBe(10);
    expect(result[0].isAvailable).toBe(false);
  });

  it("uses default capacity 300 when no season or override exists", async () => {
    (mockPrisma.dailyCapacity.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.booking.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.season.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getAvailabilityCalendar("2026-03-01", "2026-03-01", 1);

    expect(result[0].capacityLimit).toBe(300);
  });
});
