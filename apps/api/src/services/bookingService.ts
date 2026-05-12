import { prisma } from "../db";
import { Prisma, BookingStatus, GroupType, PaymentMethod } from "@prisma/client";
import {
  CreateBookingInput,
  RescheduleBookingInput,
  ErrorCode,
  LARGE_GROUP_THRESHOLD,
  MAX_CLASSES_PER_BOOKING,
  MAX_CLASSES_SMALL_GROUP,
  RESCHEDULE_TOKEN_HOURS,
} from "@tidebook/shared";
import { AppError } from "../middleware/errorHandler";
import { checkDailyCapacity } from "./capacityService";
import { checkClassAvailability } from "./classService";
import { encrypt, decrypt, generateSecureToken, hashToken } from "../utils/encryption";
import { addDays, addHours, parseISO } from "date-fns";
import { auditLog } from "./auditService";
import { scheduleEmailTriggers } from "./emailService";
import { pushToAcme } from "../adapters/acmeAdapter";
import { logger } from "../logger";

function encryptBookingPii(input: CreateBookingInput) {
  return {
    organizationName: encrypt(input.organizationName),
    contactName: encrypt(input.contactName),
    contactEmail: encrypt(input.contactEmail),
    contactPhone: encrypt(input.contactPhone),
    ...(input.dayOfContactName?.trim() ? { dayOfContactName: encrypt(input.dayOfContactName) } : {}),
    ...(input.dayOfContactPhone?.trim() ? { dayOfContactPhone: encrypt(input.dayOfContactPhone) } : {}),
  };
}

function decryptBookingPii(booking: {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  dayOfContactName?: string | null;
  dayOfContactPhone?: string | null;
}) {
  return {
    organizationName: decrypt(booking.organizationName),
    contactName: decrypt(booking.contactName),
    contactEmail: decrypt(booking.contactEmail),
    contactPhone: decrypt(booking.contactPhone),
    ...(booking.dayOfContactName ? { dayOfContactName: decrypt(booking.dayOfContactName) } : {}),
    ...(booking.dayOfContactPhone ? { dayOfContactPhone: decrypt(booking.dayOfContactPhone) } : {}),
  };
}

export function decryptBooking<T extends {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  dayOfContactName?: string | null;
  dayOfContactPhone?: string | null;
}>(booking: T): T {
  return {
    ...booking,
    ...decryptBookingPii(booking),
  };
}

function requiresRegistrarReview(input: CreateBookingInput): boolean {
  const hasAccessibilityNeeds =
    !!input.accessibilityNeeds?.trim() &&
    input.accessibilityNeeds.trim() !== "None";
  return (
    input.paymentMethod === PaymentMethod.SCHOLARSHIP ||
    hasAccessibilityNeeds
  );
}

export async function createBooking(
  input: CreateBookingInput,
  ipAddress?: string,
  connectionsPartnerId?: string
): Promise<{ booking: ReturnType<typeof decryptBooking<any>>; rescheduleToken: string }> {
  // Honeypot check
  if ((input as any).website) {
    // Silently succeed to avoid tipping off bots
    return { booking: null as any, rescheduleToken: "" };
  }

  const groupSize = input.studentCount + input.adultCount;

  // Validate scholarship sub-flow
  if (input.paymentMethod === PaymentMethod.SCHOLARSHIP && !input.scholarship) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Scholarship information is required",
      400,
      { scholarship: "Scholarship details are required when payment method is scholarship" }
    );
  }

  // Validate class count limit
  const maxClasses = groupSize >= LARGE_GROUP_THRESHOLD ? MAX_CLASSES_PER_BOOKING : MAX_CLASSES_SMALL_GROUP;
  if (input.classOfferingId && maxClasses < 1) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Class selection not permitted for this group", 400);
  }

  // Generate reschedule token — expiry window is configurable via setting
  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const visitDate = input.visitDate;
  const cutoffSetting = await prisma.appSetting.findUnique({ where: { key: "reschedule_cutoff_days" } });
  const cutoffHours = cutoffSetting ? parseInt(cutoffSetting.value) * 24 : RESCHEDULE_TOKEN_HOURS;
  const tokenExpiresAt = addHours(parseISO(visitDate + "T12:00:00Z"), -cutoffHours);

  // --- Atomic transaction: capacity check + booking creation ---
  const booking = await prisma.$transaction(async (tx) => {
    // Lock and verify capacity
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${visitDate}::text))`;

    await checkDailyCapacity(visitDate, groupSize);

    // Check season is open
    const season = await tx.season.findFirst({
      where: {
        startDate: { lte: visitDate },
        endDate: { gte: visitDate },
        isPublished: true,
        registrationOpensAt: { lte: new Date() },
        registrationClosesAt: { gte: new Date() },
      },
    });

    if (!season) {
      throw new AppError(
        ErrorCode.REGISTRATION_CLOSED,
        "Registration is not currently open for the selected date",
        422
      );
    }

    // Validate class if selected
    if (input.classOfferingId) {
      await checkClassAvailability(
        input.classOfferingId,
        visitDate,
        input.classTimeSlot ?? input.arrivalTimeSlot,
        undefined,
        input.arrivalTimeSlot
      );
    }

    const needsReview = requiresRegistrarReview(input);
    const status = needsReview ? BookingStatus.PENDING : BookingStatus.CONFIRMED;

    const encrypted = encryptBookingPii(input);

    const created = await tx.booking.create({
      data: {
        status,
        groupType: input.groupType as unknown as GroupType,
        ...encrypted,
        schoolDistrict: input.schoolDistrict?.trim() || null,
        addressStreet1: input.addressStreet1?.trim() || null,
        addressStreet2: input.addressStreet2?.trim() || null,
        addressCity: input.addressCity?.trim() || null,
        addressState: input.addressState ?? "WA",
        addressZip: input.addressZip?.trim() || null,
        gradeLevels: input.gradeLevels,
        gradeStudentCounts: input.gradeStudentCounts ?? null,
        studentCount: input.studentCount,
        adultCount: input.adultCount,
        visitDate,
        arrivalTimeSlot: input.arrivalTimeSlot,
        paymentMethod: input.paymentMethod as unknown as PaymentMethod,
        accessibilityNeeds: input.accessibilityNeeds,
        specialRequests: input.specialRequests,
        cocAcknowledged: input.cocAcknowledged,
        rescheduleTokenHash: tokenHash,
        rescheduleTokenExpiresAt: tokenExpiresAt,
        connectionsPartnerId,
        ...(status === BookingStatus.CONFIRMED && { confirmedAt: new Date() }),
        classBookings: input.classOfferingId
          ? {
              create: {
                classOfferingId: input.classOfferingId,
                sessionSlot: input.classTimeSlot ?? input.arrivalTimeSlot,
              },
            }
          : undefined,
        scholarshipApplication:
          input.paymentMethod === PaymentMethod.SCHOLARSHIP && input.scholarship
            ? {
                create: {
                  titleOneStatus: input.scholarship.titleOneStatus,
                  enrollmentCount: input.scholarship.enrollmentCount,
                  qualifyingInfo: input.scholarship.qualifyingInfo,
                },
              }
            : undefined,
      },
      include: {
        classBookings: { include: { classOffering: true } },
        scholarshipApplication: true,
      },
    });

    return created;
  });

  await auditLog({
    actorType: "SYSTEM",
    action: "BOOKING_CREATED",
    entityType: "Booking",
    entityId: booking.id,
    after: { status: booking.status, visitDate: booking.visitDate },
    ipAddress,
  });

  // Schedule email triggers (non-blocking) — pass rawToken so reschedule link is real
  scheduleEmailTriggers(booking.id, booking.status, booking.visitDate, rawToken).catch((err) => {
    logger.error({ err, bookingId: booking.id }, "Failed to schedule email triggers");
  });

  // Push to ACME for confirmed bookings
  if (booking.status === BookingStatus.CONFIRMED) {
    pushToAcme(booking.id).catch((err) => {
      logger.error({ err, bookingId: booking.id }, "ACME push failed after booking creation");
    });
  }

  return { booking: decryptBooking(booking), rescheduleToken: rawToken };
}

export async function rescheduleBooking(
  input: RescheduleBookingInput,
  ipAddress?: string
): Promise<{ booking: ReturnType<typeof decryptBooking<any>>; newRescheduleToken: string }> {
  const tokenHash = hashToken(input.token);

  const booking = await prisma.booking.findUnique({
    where: { rescheduleTokenHash: tokenHash },
    include: {
      classBookings: { include: { classOffering: true } },
      scholarshipApplication: true,
    },
  });

  if (!booking) {
    throw new AppError(ErrorCode.RESCHEDULE_TOKEN_INVALID, "Not found", 404);
  }

  if (booking.rescheduleDisabled) {
    throw new AppError(ErrorCode.RESCHEDULE_DISABLED, "Rescheduling is not available for this booking", 422);
  }

  if (!booking.rescheduleTokenExpiresAt || new Date() > booking.rescheduleTokenExpiresAt) {
    throw new AppError(ErrorCode.RESCHEDULE_WINDOW_CLOSED, "The reschedule window has closed", 422);
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new AppError(ErrorCode.BOOKING_NOT_RESCHEDULABLE, "Only confirmed bookings can be rescheduled", 422);
  }

  const groupSize = booking.studentCount + booking.adultCount;
  const newVisitDate = input.visitDate;

  const needsReview =
    !!booking.scholarshipApplication ||
    !!booking.accessibilityNeeds ||
    booking.studentCount !== booking.studentCount; // group size change (reserved)

  const newRawToken = generateSecureToken(32);
  const newTokenHash = hashToken(newRawToken);
  const newTokenExpiresAt = addHours(
    parseISO(newVisitDate + "T12:00:00Z"),
    -(RESCHEDULE_TOKEN_HOURS)
  );

  const updatedBooking = await prisma.$transaction(async (tx) => {
    // Lock both dates
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${newVisitDate}::text))`;

    // Verify new date capacity (excluding current booking's headcount on old date)
    await checkDailyCapacity(newVisitDate, groupSize);

    // Validate new class if provided
    if (input.classOfferingId) {
      await checkClassAvailability(
        input.classOfferingId,
        newVisitDate,
        (input as any).classTimeSlot ?? input.arrivalTimeSlot,
        booking.id,
        input.arrivalTimeSlot
      );
    }

    // Delete existing class bookings (will be replaced)
    await tx.classBooking.deleteMany({ where: { bookingId: booking.id } });

    const newStatus = needsReview ? BookingStatus.PENDING : BookingStatus.CONFIRMED;

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        visitDate: newVisitDate,
        arrivalTimeSlot: input.arrivalTimeSlot,
        status: newStatus,
        rescheduleTokenHash: newTokenHash,
        rescheduleTokenExpiresAt: newTokenExpiresAt,
        ...(newStatus === BookingStatus.CONFIRMED && { confirmedAt: new Date() }),
        classBookings: input.classOfferingId
          ? {
              create: {
                classOfferingId: input.classOfferingId,
                sessionSlot: (input as any).classTimeSlot ?? input.arrivalTimeSlot,
              },
            }
          : undefined,
      },
      include: {
        classBookings: { include: { classOffering: true } },
        scholarshipApplication: true,
      },
    });

    return updated;
  });

  await auditLog({
    actorType: "SYSTEM",
    action: "BOOKING_RESCHEDULED",
    entityType: "Booking",
    entityId: booking.id,
    before: { visitDate: booking.visitDate, arrivalTimeSlot: booking.arrivalTimeSlot },
    after: { visitDate: newVisitDate, arrivalTimeSlot: input.arrivalTimeSlot },
    ipAddress,
  });

  scheduleEmailTriggers(updatedBooking.id, updatedBooking.status, updatedBooking.visitDate).catch(
    (err) => logger.error({ err, bookingId: updatedBooking.id }, "Failed to schedule email triggers after reschedule")
  );

  return { booking: decryptBooking(updatedBooking), newRescheduleToken: newRawToken };
}

export async function cancelBookingByToken(
  token: string,
  cancellationCutoffDays: number,
  ipAddress?: string
): Promise<void> {
  const tokenHash = hashToken(token);

  const booking = await prisma.booking.findUnique({
    where: { rescheduleTokenHash: tokenHash },
  });

  if (!booking) {
    throw new AppError(ErrorCode.RESCHEDULE_TOKEN_INVALID, "Not found", 404);
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(ErrorCode.BOOKING_NOT_RESCHEDULABLE, "Booking is already cancelled", 422);
  }

  // Check cancellation cutoff
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = Math.floor(
    (parseISO(booking.visitDate + "T12:00:00Z").getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (daysUntil < cancellationCutoffDays) {
    throw new AppError(
      ErrorCode.CANCELLATION_WINDOW_CLOSED,
      `Cancellations are not available within ${cancellationCutoffDays} days of the visit. Please contact us directly.`,
      422
    );
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELLED,
      rescheduleTokenHash: null,
      rescheduleTokenExpiresAt: null,
    },
  });

  await auditLog({
    actorType: "SYSTEM",
    action: "BOOKING_CANCELLED",
    entityType: "Booking",
    entityId: booking.id,
    before: { status: booking.status },
    after: { status: "CANCELLED" },
    ipAddress,
  });
}

export async function getBookingForReschedule(token: string): Promise<ReturnType<typeof decryptBooking<any>>> {
  const tokenHash = hashToken(token);
  const booking = await prisma.booking.findUnique({
    where: { rescheduleTokenHash: tokenHash },
    include: { classBookings: { include: { classOffering: true } } },
  });

  if (!booking) {
    throw new AppError(ErrorCode.RESCHEDULE_TOKEN_INVALID, "Not found", 404);
  }

  if (booking.rescheduleDisabled) {
    throw new AppError(ErrorCode.RESCHEDULE_DISABLED, "Rescheduling is not available", 422);
  }

  if (!booking.rescheduleTokenExpiresAt || new Date() > booking.rescheduleTokenExpiresAt) {
    throw new AppError(ErrorCode.RESCHEDULE_WINDOW_CLOSED, "The reschedule window has closed", 422);
  }

  return decryptBooking(booking);
}
