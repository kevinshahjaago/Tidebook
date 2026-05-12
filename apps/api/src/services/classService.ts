import { prisma } from "../db";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode, MAX_CONCURRENT_CLASSES } from "@tidebook/shared";

async function getClassSchedulingSettings(): Promise<{ breakMinutes: number; arrivalBufferMinutes: number }> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["class_break_minutes", "class_arrival_buffer_minutes"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    breakMinutes: parseInt(map.class_break_minutes ?? "45"),
    arrivalBufferMinutes: parseInt(map.class_arrival_buffer_minutes ?? "15"),
  };
}

export interface ClassSlotAvailability {
  classOfferingId: string;
  classOfferingName: string;
  date: string;
  availableSlots: string[];
  capacity: number;
  bookedCount: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

/**
 * Check whether a class can be scheduled at a given time on a given date.
 * Rules:
 *  - Max 2 classes running concurrently on any day
 *  - 45-minute gap between sessions in the same classroom (per offering)
 *  - Each class has its own headcount capacity
 */
export async function checkClassAvailability(
  classOfferingId: string,
  date: string,
  sessionSlot: string,
  excludeBookingId?: string,
  arrivalTimeSlot?: string
): Promise<void> {
  const [offering, { breakMinutes, arrivalBufferMinutes }] = await Promise.all([
    prisma.classOffering.findUnique({ where: { id: classOfferingId } }),
    getClassSchedulingSettings(),
  ]);

  if (!offering || !offering.isActive) {
    throw new AppError(ErrorCode.CLASS_NOT_FOUND, "Class not found or no longer available", 404);
  }

  // Enforce arrival buffer — class must start at least N minutes after arrival
  if (arrivalTimeSlot) {
    const arrivalMins = timeToMinutes(arrivalTimeSlot);
    const sessionMins = timeToMinutes(sessionSlot);
    if (sessionMins < arrivalMins + arrivalBufferMinutes) {
      throw new AppError(
        ErrorCode.CLASS_SLOT_UNAVAILABLE,
        `The program must start at least ${arrivalBufferMinutes} minutes after your arrival time.`,
        409
      );
    }
  }

  const slotStart = timeToMinutes(sessionSlot);
  const slotEnd = slotStart + offering.durationMinutes;

  // All class bookings on this date (excluding the booking being rescheduled)
  const existingClassBookings = await prisma.classBooking.findMany({
    where: {
      booking: {
        visitDate: date,
        status: { in: ["PENDING", "CONFIRMED"] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    },
    include: { classOffering: true },
  });

  // Check concurrent class limit
  const overlapping = existingClassBookings.filter((cb) => {
    const cbStart = timeToMinutes(cb.sessionSlot);
    const cbEnd = cbStart + (cb.classOffering?.durationMinutes ?? 60);
    return slotStart < cbEnd && slotEnd > cbStart;
  });

  if (overlapping.length >= MAX_CONCURRENT_CLASSES) {
    throw new AppError(
      ErrorCode.CLASS_SLOT_UNAVAILABLE,
      `Maximum of ${MAX_CONCURRENT_CLASSES} classes can run concurrently. This time slot is full.`,
      409
    );
  }

  // Check gap requirement for the same class offering
  const sameOfferingBookings = existingClassBookings.filter(
    (cb) => cb.classOfferingId === classOfferingId
  );

  for (const cb of sameOfferingBookings) {
    const cbStart = timeToMinutes(cb.sessionSlot);
    const cbEnd = cbStart + offering.durationMinutes;
    const gapBefore = slotStart - cbEnd;
    const gapAfter = cbStart - slotEnd;

    if (
      (gapBefore >= 0 && gapBefore < breakMinutes) ||
      (gapAfter >= 0 && gapAfter < breakMinutes) ||
      (slotStart < cbEnd && slotEnd > cbStart)
    ) {
      throw new AppError(
        ErrorCode.CLASS_SLOT_UNAVAILABLE,
        `A ${breakMinutes}-minute break is required between sessions of the same program.`,
        409
      );
    }
  }

  // Check class headcount capacity
  const bookedForSlot = existingClassBookings.filter(
    (cb) => cb.classOfferingId === classOfferingId && cb.sessionSlot === sessionSlot
  );

  if (bookedForSlot.length >= offering.capacity) {
    throw new AppError(
      ErrorCode.CLASS_CAPACITY_EXCEEDED,
      "This class session is at capacity.",
      409
    );
  }
}

export async function getClassAvailabilityForDate(
  date: string,
  availableSlots: string[],
  arrivalTimeSlot?: string
): Promise<ClassSlotAvailability[]> {
  const [offerings, existingBookings, { breakMinutes, arrivalBufferMinutes }] = await Promise.all([
    prisma.classOffering.findMany({ where: { isActive: true } }),
    prisma.classBooking.findMany({
      where: { booking: { visitDate: date, status: { in: ["PENDING", "CONFIRMED"] } } },
      include: { classOffering: true },
    }),
    getClassSchedulingSettings(),
  ]);

  const arrivalMins = arrivalTimeSlot ? timeToMinutes(arrivalTimeSlot) : null;

  return offerings.map((offering) => {
    const offeringBookings = existingBookings.filter((cb) => cb.classOfferingId === offering.id);

    // Determine candidate slots: use offering's configured slots if set, else fall back to all day slots
    const candidateSlots: string[] = (() => {
      try {
        const configured: string[] = JSON.parse(offering.availableTimeSlots ?? "[]");
        return configured.length > 0 ? configured : availableSlots;
      } catch { return availableSlots; }
    })();

    const validSlots = candidateSlots.filter((slot) => {
      const slotStart = timeToMinutes(slot);
      const slotEnd = slotStart + offering.durationMinutes;

      // Arrival buffer: class must start at least N min after arrival
      if (arrivalMins !== null && slotStart < arrivalMins + arrivalBufferMinutes) return false;

      // Concurrent class limit
      const concurrent = existingBookings.filter((cb) => {
        const cbStart = timeToMinutes(cb.sessionSlot);
        const cbEnd = cbStart + (cb.classOffering?.durationMinutes ?? 60);
        return slotStart < cbEnd && slotEnd > cbStart;
      });
      if (concurrent.length >= MAX_CONCURRENT_CLASSES) return false;

      // Gap rule for same offering
      for (const cb of offeringBookings) {
        const cbStart = timeToMinutes(cb.sessionSlot);
        const cbEnd = cbStart + offering.durationMinutes;
        const gapBefore = slotStart - cbEnd;
        const gapAfter = cbStart - slotEnd;
        if (
          (gapBefore >= 0 && gapBefore < breakMinutes) ||
          (gapAfter >= 0 && gapAfter < breakMinutes) ||
          (slotStart < cbEnd && slotEnd > cbStart)
        ) return false;
      }

      // Capacity check for this specific slot
      const slotCount = offeringBookings.filter((cb) => cb.sessionSlot === slot).length;
      if (slotCount >= offering.capacity) return false;

      return true;
    });

    return {
      classOfferingId: offering.id,
      classOfferingName: offering.name,
      date,
      availableSlots: validSlots,
      capacity: offering.capacity,
      bookedCount: offeringBookings.length,
    };
  });
}
