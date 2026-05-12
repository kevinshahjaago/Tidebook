import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { createBooking, rescheduleBooking, cancelBookingByToken, getBookingForReschedule } from "../services/bookingService";
import { getAvailabilityCalendar, getDailyCapacityInfo, getUsedCapacity, getEffectiveCapacityLimit } from "../services/capacityService";
import { getClassAvailabilityForDate } from "../services/classService";
import { validate } from "../middleware/validate";
import { publicRateLimit, rescheduleTokenRateLimit } from "../middleware/rateLimiter";
import {
  createBookingSchema,
  rescheduleBookingSchema,
  cancelBookingSchema,
  dateStringSchema,
} from "@tidebook/shared";
import { z } from "zod";
import { generateTimeSlots } from "../utils/dates";
import { addMinutes } from "date-fns";

export const publicRouter = Router();

// Public subset of app settings safe to expose to unauthenticated users
const PUBLIC_SETTINGS = [
  "code_of_conduct_url",
  "group_type_options",
  "booking_form_subtitle",
  "booking_connections_notice",
  "booking_class_step_description",
  "booking_coc_prefix",
  "booking_coc_link_label",
  "booking_coc_suffix",
  "chaperone_ratio_lower_grades",
  "chaperone_ratio_upper_grades",
  "chaperone_ratio_default",
  "arrival_slot_start",
  "arrival_slot_end",
  "arrival_slot_interval_minutes",
  "payment_method_options",
  "accessibility_options",
  "class_arrival_buffer_minutes",
  "booking_special_requests_label",
  "booking_portal_enabled",
  "booking_portal_closed_message",
  "slot_hold_minutes",
  "booking_slot_hold_banner",
] as const;

publicRouter.get("/settings", publicRateLimit, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: [...PUBLIC_SETTINGS] } } });
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// Calendar availability
publicRouter.get("/availability", publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, groupSize } = z.object({
      startDate: dateStringSchema,
      endDate: dateStringSchema,
      groupSize: z.coerce.number().int().min(1).max(600).default(1),
    }).parse(req.query);

    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ["limited_availability_threshold", "arrival_slot_start", "arrival_slot_end", "arrival_slot_interval_minutes"] } },
    });

    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const threshold = parseInt(settingsMap.limited_availability_threshold ?? "30");
    const slotStart = settingsMap.arrival_slot_start ?? "09:00";
    const slotEnd = settingsMap.arrival_slot_end ?? "14:00";
    const slotInterval = parseInt(settingsMap.arrival_slot_interval_minutes ?? "30");

    const calendar = await getAvailabilityCalendar(startDate, endDate, groupSize, threshold);
    const timeSlots = generateTimeSlots(slotStart, slotEnd, slotInterval);

    res.json({ calendar, timeSlots });
  } catch (err) {
    next(err);
  }
});

// Class offerings
publicRouter.get("/classes", publicRateLimit, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const classes = await prisma.classOffering.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ classes });
  } catch (err) {
    next(err);
  }
});

// Class availability for a specific date, optionally filtered by arrival time
publicRouter.get("/classes/availability", publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, arrivalTimeSlot } = z.object({
      date: dateStringSchema,
      arrivalTimeSlot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }).parse(req.query);

    const settings = await prisma.appSetting.findMany({
      where: { key: { in: ["arrival_slot_start", "arrival_slot_end", "arrival_slot_interval_minutes"] } },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const timeSlots = generateTimeSlots(
      settingsMap.arrival_slot_start ?? "09:00",
      settingsMap.arrival_slot_end ?? "14:00",
      parseInt(settingsMap.arrival_slot_interval_minutes ?? "30")
    );

    const availability = await getClassAvailabilityForDate(date, timeSlots, arrivalTimeSlot);
    res.json({ availability });
  } catch (err) {
    next(err);
  }
});

// Create booking
publicRouter.post("/bookings", publicRateLimit, validate(createBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ipAddress = req.ip;
    const result = await createBooking(req.body, ipAddress);

    if (!result.booking) {
      // Honeypot triggered — return fake success
      res.status(201).json({ bookingId: "pending", status: "PENDING" });
      return;
    }

    res.status(201).json({
      bookingId: result.booking.id,
      status: result.booking.status,
      visitDate: result.booking.visitDate,
      arrivalTimeSlot: result.booking.arrivalTimeSlot,
      rescheduleToken: result.rescheduleToken,
    });
  } catch (err) {
    next(err);
  }
});

// Get booking for reschedule page (token-authenticated)
publicRouter.get("/bookings/reschedule", rescheduleTokenRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.query);
    const booking = await getBookingForReschedule(token);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

// Reschedule booking
publicRouter.post("/bookings/reschedule", rescheduleTokenRateLimit, validate(rescheduleBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await rescheduleBooking(req.body, req.ip);
    res.json({
      bookingId: result.booking.id,
      status: result.booking.status,
      visitDate: result.booking.visitDate,
      arrivalTimeSlot: result.booking.arrivalTimeSlot,
      newRescheduleToken: result.newRescheduleToken,
    });
  } catch (err) {
    next(err);
  }
});

// Slot holds — temporarily reserve capacity while a user fills out the booking form
publicRouter.post("/holds", publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visitDate, timeSlot, groupSize } = z.object({
      visitDate: dateStringSchema,
      timeSlot: z.string().regex(/^\d{2}:\d{2}$/),
      groupSize: z.coerce.number().int().min(1).max(600),
    }).parse(req.body);

    const holdMinutesSetting = await prisma.appSetting.findUnique({ where: { key: "slot_hold_minutes" } });
    const holdMinutes = parseInt(holdMinutesSetting?.value ?? "15");

    // Check capacity before creating hold (holds + bookings must not exceed limit)
    const [capacityLimit, usedWithHolds] = await Promise.all([
      getEffectiveCapacityLimit(visitDate),
      getUsedCapacity(visitDate),
    ]);

    if (usedWithHolds + groupSize > capacityLimit) {
      return res.status(409).json({ error: { message: "This date does not have enough capacity for your group." } });
    }

    // Clean up expired holds periodically (best-effort, non-blocking)
    prisma.slotHold.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    const expiresAt = addMinutes(new Date(), holdMinutes);
    const hold = await prisma.slotHold.create({
      data: { visitDate, timeSlot, groupSize, expiresAt },
    });

    res.status(201).json({ holdId: hold.id, expiresAt: hold.expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

publicRouter.delete("/holds/:id", publicRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.slotHold.deleteMany({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Cancel booking
publicRouter.post("/bookings/cancel", rescheduleTokenRateLimit, validate(cancelBookingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.appSetting.findUnique({ where: { key: "cancellation_cutoff_days" } });
    const cutoffDays = parseInt(settings?.value ?? "5");
    await cancelBookingByToken(req.body.token, cutoffDays, req.ip);
    res.json({ message: "Booking cancelled successfully" });
  } catch (err) {
    next(err);
  }
});
