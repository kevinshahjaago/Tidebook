import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  bookingFilterSchema,
  confirmBookingSchema,
  declineBookingSchema,
  updateBookingNotesSchema,
  reviewScholarshipSchema,
  classOfferingSchema,
  dailyCapacitySchema,
  seasonSchema,
  createUserSchema,
  updateUserSchema,
  UserRole,
  BookingStatus,
} from "@tidebook/shared";
import { BookingStatus as PrismaBookingStatus } from "@prisma/client";
import { auditLog } from "../services/auditService";
import { retryAcmePush } from "../adapters/acmeAdapter";
import { scheduleEmailTriggers } from "../services/emailService";
import { decryptBooking } from "../services/bookingService";
import { generateSecureToken, hashToken } from "../utils/encryption";
import bcrypt from "bcrypt";
import { config } from "../config";
import { decrypt } from "../utils/encryption";
import { z } from "zod";
import { addHours, parseISO } from "date-fns";
import { RESCHEDULE_TOKEN_HOURS } from "@tidebook/shared";

export const adminRouter = Router();

// All admin routes require authentication
adminRouter.use(requireAuth);

// ─── Bookings ─────────────────────────────────────────────────────────────────

adminRouter.get("/bookings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = bookingFilterSchema.parse(req.query);
    const { page, limit, status, groupType, paymentMethod, dateFrom, dateTo, scholarshipStatus, search } = filter;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (groupType) where.groupType = groupType;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (dateFrom || dateTo) {
      where.visitDate = {};
      if (dateFrom) where.visitDate.gte = dateFrom;
      if (dateTo) where.visitDate.lte = dateTo;
    }
    if (scholarshipStatus) {
      where.scholarshipApplication = { status: scholarshipStatus };
    }

    // Search: PII fields are encrypted so we load candidates and filter in-process
    // For ACME order number (not encrypted) we can filter in DB
    if (search) {
      const term = search.trim().toUpperCase();
      if (/^[A-Z0-9-]{4,}$/.test(term)) {
        where.acmeOrderNumber = { contains: term, mode: "insensitive" };
      }
    }

    let [bookings, total] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        include: {
          classBookings: { include: { classOffering: true } },
          scholarshipApplication: true,
          busReimbursement: true,
        },
        orderBy: { visitDate: "asc" },
        skip: search ? 0 : skip,  // when text searching, load more to filter
        take: search ? 500 : limit,
      }),
      prisma.booking.count({ where }),
    ]);

    // Post-decrypt text search against org name and contact name
    if (search) {
      const decrypted = bookings.map(decryptBooking);
      const lower = search.toLowerCase();
      const filtered = decrypted.filter((b: any) =>
        b.organizationName?.toLowerCase().includes(lower) ||
        b.contactName?.toLowerCase().includes(lower) ||
        b.contactEmail?.toLowerCase().includes(lower) ||
        b.acmeOrderNumber?.toLowerCase().includes(lower)
      );
      const paginated = filtered.slice(skip, skip + limit);
      return res.json({
        data: paginated,
        pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
      });
    }

    res.json({
      data: bookings.map(decryptBooking),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/bookings/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        classBookings: { include: { classOffering: true, instructor: true } },
        scholarshipApplication: true,
        busReimbursement: true,
        emailLogs: { orderBy: { sentAt: "desc" } },
      },
    });

    if (!booking) {
      res.status(404).json({ error: { code: "BOOKING_NOT_FOUND", message: "Booking not found" } });
      return;
    }

    const decrypted = decryptBooking(booking);
    // Decrypt email log addresses
    const emailLogs = booking.emailLogs.map((log) => ({
      ...log,
      toAddress: decrypt(log.toAddress),
    }));

    res.json({ ...decrypted, emailLogs });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/bookings/:id/confirm",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(confirmBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.booking.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: { code: "BOOKING_NOT_FOUND", message: "Not found" } });
        return;
      }

      // Generate a fresh reschedule token so the confirmation email has a working link
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const tokenExpiresAt = addHours(
        parseISO(existing.visitDate + "T12:00:00Z"),
        -(RESCHEDULE_TOKEN_HOURS)
      );

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: PrismaBookingStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedById: req.user!.id,
          rescheduleTokenHash: tokenHash,
          rescheduleTokenExpiresAt: tokenExpiresAt,
          rescheduleDisabled: false,
          ...(req.body.internalNotes !== undefined ? { internalNotes: req.body.internalNotes } : {}),
        },
      });

      await auditLog({
        actorId: req.user!.id,
        actorType: "USER",
        action: "BOOKING_CONFIRMED",
        entityType: "Booking",
        entityId: id,
        before: { status: existing.status },
        after: { status: "CONFIRMED" },
        ipAddress: req.ip,
      });

      scheduleEmailTriggers(id, "CONFIRMED", updated.visitDate, rawToken).catch(() => {});
      retryAcmePush(id).catch(() => {});

      res.json({ message: "Booking confirmed", bookingId: id });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.post(
  "/bookings/:id/decline",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(declineBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.booking.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: { code: "BOOKING_NOT_FOUND", message: "Not found" } });
        return;
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: PrismaBookingStatus.DECLINED,
          declinedAt: new Date(),
          declinedReason: req.body.reason,
        },
      });

      await auditLog({
        actorId: req.user!.id,
        actorType: "USER",
        action: "BOOKING_DECLINED",
        entityType: "Booking",
        entityId: id,
        before: { status: existing.status },
        after: { status: "DECLINED", reason: req.body.reason },
        ipAddress: req.ip,
      });

      scheduleEmailTriggers(id, "DECLINED", updated.visitDate).catch(() => {});

      res.json({ message: "Booking declined", bookingId: id });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.patch(
  "/bookings/:id/notes",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(updateBookingNotesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.booking.update({
        where: { id: req.params.id },
        data: { internalNotes: req.body.internalNotes },
      });
      res.json({ message: "Notes updated" });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.patch(
  "/bookings/:id/disable-reschedule",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.booking.update({
        where: { id: req.params.id },
        data: { rescheduleDisabled: true },
      });
      await auditLog({
        actorId: req.user!.id,
        actorType: "USER",
        action: "RESCHEDULE_DISABLED",
        entityType: "Booking",
        entityId: req.params.id,
        ipAddress: req.ip,
      });
      res.json({ message: "Reschedule link disabled" });
    } catch (err) {
      next(err);
    }
  }
);

// Retry ACME push
adminRouter.post(
  "/bookings/:id/acme-retry",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await retryAcmePush(req.params.id);
      res.json({ message: "ACME push triggered" });
    } catch (err) {
      next(err);
    }
  }
);

// Mark booking as completed
adminRouter.post(
  "/bookings/:id/complete",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (!existing) { res.status(404).json({ error: { message: "Not found" } }); return; }
      if (existing.status !== PrismaBookingStatus.CONFIRMED) {
        res.status(422).json({ error: { message: "Only confirmed bookings can be marked completed" } }); return;
      }
      await prisma.booking.update({
        where: { id: req.params.id },
        data: { status: PrismaBookingStatus.COMPLETED },
      });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "BOOKING_COMPLETED", entityType: "Booking", entityId: req.params.id, before: { status: existing.status }, after: { status: "COMPLETED" }, ipAddress: req.ip });
      // Send post-visit survey
      const { sendEmailForBooking } = await import("../services/emailService");
      const { decrypt } = await import("../utils/encryption");
      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (booking) {
        const surveyUrlSetting = await prisma.appSetting.findUnique({ where: { key: "post_visit_survey_url" } });
        sendEmailForBooking(req.params.id, "POST_VISIT_SURVEY" as any, decrypt(booking.contactEmail), {
          contactName: decrypt(booking.contactName),
          organizationName: decrypt(booking.organizationName),
          visitDate: booking.visitDate,
          surveyLink: surveyUrlSetting?.value ?? `${process.env.WEB_BASE_URL ?? ""}/survey`,
        }).catch(() => {});
      }
      res.json({ message: "Booking marked completed" });
    } catch (err) { next(err); }
  }
);

// Resend email
adminRouter.post(
  "/bookings/:id/resend-email",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { triggerType } = z.object({
        triggerType: z.string().min(1),
      }).parse(req.body);

      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (!booking) { res.status(404).json({ error: { message: "Not found" } }); return; }

      const { sendEmailForBooking } = await import("../services/emailService");
      const { decrypt } = await import("../utils/encryption");
      const surveyUrlSetting = await prisma.appSetting.findUnique({ where: { key: "post_visit_survey_url" } });
      const cocSetting = await prisma.appSetting.findUnique({ where: { key: "code_of_conduct_url" } });

      const variables: Record<string, string> = {
        contactName: decrypt(booking.contactName),
        organizationName: decrypt(booking.organizationName),
        visitDate: booking.visitDate,
        arrivalTimeSlot: booking.arrivalTimeSlot,
        studentCount: String(booking.studentCount),
        adultCount: String(booking.adultCount),
        bookingId: booking.id,
        rescheduleLink: "",
        bookingUrl: process.env.WEB_BASE_URL ?? "",
        className: "",
        classBooking: "",
        declinedReason: booking.declinedReason ?? "",
        surveyLink: surveyUrlSetting?.value ?? "",
        applicationLink: "",
        reimbursementLink: "",
        cocLink: cocSetting?.value ?? "",
        paymentInstructions: "",
      };

      await sendEmailForBooking(req.params.id, triggerType as any, decrypt(booking.contactEmail), variables);
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "EMAIL_RESENT", entityType: "Booking", entityId: req.params.id, after: { triggerType }, ipAddress: req.ip });
      res.json({ message: "Email sent" });
    } catch (err) { next(err); }
  }
);

// Bus reimbursement status update
adminRouter.patch(
  "/bookings/:id/bus-reimbursement",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, amountApproved, busCount } = z.object({
        status: z.enum(["NOT_SUBMITTED", "SUBMITTED", "PROCESSED"]),
        amountApproved: z.number().positive().optional(),
        busCount: z.number().int().min(1).optional(),
      }).parse(req.body);

      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
      if (!booking) { res.status(404).json({ error: { message: "Not found" } }); return; }

      const existing = await prisma.busReimbursement.findUnique({ where: { bookingId: req.params.id } });
      const data: any = {
        status,
        ...(amountApproved !== undefined ? { amountApproved } : {}),
        ...(busCount !== undefined ? { busCount } : {}),
        ...(status === "SUBMITTED" && !existing?.submittedAt ? { submittedAt: new Date() } : {}),
        ...(status === "PROCESSED" ? { processedAt: new Date() } : {}),
      };

      const reimbursement = await prisma.busReimbursement.upsert({
        where: { bookingId: req.params.id },
        update: data,
        create: { bookingId: req.params.id, ...data },
      });

      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "BUS_REIMBURSEMENT_UPDATED", entityType: "BusReimbursement", entityId: reimbursement.id, after: data, ipAddress: req.ip });
      res.json({ reimbursement });
    } catch (err) { next(err); }
  }
);

// Batch assign instructor to all class bookings in a session (by class booking IDs)
adminRouter.post(
  "/class-bookings/assign-instructor",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classBookingIds, instructorId } = z.object({
        classBookingIds: z.array(z.string()).min(1),
        instructorId: z.string().uuid().nullable(),
      }).parse(req.body);

      await prisma.classBooking.updateMany({
        where: { id: { in: classBookingIds } },
        data: { instructorId },
      });

      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "INSTRUCTOR_BATCH_ASSIGNED", entityType: "ClassBooking", entityId: classBookingIds.join(","), after: { instructorId, count: classBookingIds.length }, ipAddress: req.ip });
      res.json({ message: `Instructor assigned to ${classBookingIds.length} booking(s)` });
    } catch (err) { next(err); }
  }
);

// Assign instructor to a class booking
adminRouter.patch(
  "/class-bookings/:id/instructor",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { instructorId } = z.object({
        instructorId: z.string().uuid().nullable(),
      }).parse(req.body);

      const cb = await prisma.classBooking.update({
        where: { id: req.params.id },
        data: { instructorId },
        include: { instructor: { select: { id: true, email: true } } },
      });

      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "INSTRUCTOR_ASSIGNED", entityType: "ClassBooking", entityId: req.params.id, after: { instructorId }, ipAddress: req.ip });
      res.json({ classBooking: cb });
    } catch (err) { next(err); }
  }
);

// Daily Visit Log (DVL) export
adminRouter.get("/dvl", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);

    const where: any = { status: { in: ["CONFIRMED", "COMPLETED"] } };
    if (date) where.visitDate = date;

    const bookings = await prisma.booking.findMany({
      where,
      include: { classBookings: { include: { classOffering: true } }, scholarshipApplication: true },
      orderBy: [{ visitDate: "asc" }, { arrivalTimeSlot: "asc" }],
    });

    const rows = bookings.map((b) => {
      const dec = decryptBooking(b);
      return {
        date: b.visitDate,
        time: b.arrivalTimeSlot,
        groupName: dec.organizationName,
        groupType: b.groupType,
        students: b.studentCount,
        adults: b.adultCount,
        total: b.studentCount + b.adultCount,
        class: b.classBookings[0]?.classOffering?.name ?? "",
        paymentMethod: b.paymentMethod,
        acmeOrderNumber: b.acmeOrderNumber ?? "",
        scholarshipStatus: b.scholarshipApplication?.status ?? "",
        contactName: dec.contactName,
        contactEmail: dec.contactEmail,
      };
    });

    if (req.query.format === "csv") {
      const header = Object.keys(rows[0] ?? {}).join(",");
      const csvRows = rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="dvl-${date ?? "all"}.csv"`);
      res.send([header, ...csvRows].join("\n"));
    } else {
      res.json({ data: rows, count: rows.length });
    }
  } catch (err) {
    next(err);
  }
});

// ─── Scholarship ──────────────────────────────────────────────────────────────

adminRouter.get("/scholarships", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.string().optional() }).parse(req.query);
    const scholarships = await prisma.scholarshipApplication.findMany({
      where: status ? { status: status as any } : {},
      include: { booking: true },
      orderBy: { booking: { visitDate: "asc" } },
    });
    res.json({ data: scholarships });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/scholarships/:id/review",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(reviewScholarshipSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scholarship = await prisma.scholarshipApplication.update({
        where: { id: req.params.id },
        data: {
          status: req.body.decision,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
          reviewNotes: req.body.notes,
          budgetAllocated: req.body.budgetAllocated,
        },
      });

      await auditLog({
        actorId: req.user!.id,
        actorType: "USER",
        action: `SCHOLARSHIP_${req.body.decision}`,
        entityType: "ScholarshipApplication",
        entityId: req.params.id,
        after: { status: req.body.decision },
        ipAddress: req.ip,
      });

      if (req.body.decision === "APPROVED") {
        scheduleEmailTriggers(scholarship.bookingId, "SCHOLARSHIP_APPROVED", "").catch(() => {});
      }

      res.json({ message: `Scholarship ${req.body.decision.toLowerCase()}`, scholarshipId: req.params.id });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Classes ──────────────────────────────────────────────────────────────────

adminRouter.get("/classes", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const classes = await prisma.classOffering.findMany({ orderBy: { name: "asc" } });
    res.json({ classes });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/classes",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(classOfferingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cls = await prisma.classOffering.create({ data: req.body });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "CLASS_CREATED", entityType: "ClassOffering", entityId: cls.id, after: req.body, ipAddress: req.ip });
      res.status(201).json({ class: cls });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.put(
  "/classes/:id",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(classOfferingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cls = await prisma.classOffering.update({ where: { id: req.params.id }, data: req.body });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "CLASS_UPDATED", entityType: "ClassOffering", entityId: cls.id, after: req.body, ipAddress: req.ip });
      res.json({ class: cls });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Seasons ──────────────────────────────────────────────────────────────────

adminRouter.get("/seasons", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const seasons = await prisma.season.findMany({ orderBy: { startDate: "desc" } });
    res.json({ seasons });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/seasons",
  requireRole(UserRole.ADMIN),
  validate(seasonSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const season = await prisma.season.create({ data: req.body });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "SEASON_CREATED", entityType: "Season", entityId: season.id, after: req.body, ipAddress: req.ip });
      res.status(201).json({ season });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.put(
  "/seasons/:id",
  requireRole(UserRole.ADMIN),
  validate(seasonSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const season = await prisma.season.update({ where: { id: req.params.id }, data: req.body });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "SEASON_UPDATED", entityType: "Season", entityId: season.id, after: req.body, ipAddress: req.ip });
      res.json({ season });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Daily Capacity ───────────────────────────────────────────────────────────

adminRouter.get("/capacity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).parse(req.query);

    const capacities = await prisma.dailyCapacity.findMany({
      where: {
        ...(dateFrom || dateTo
          ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
          : {}),
      },
      orderBy: { date: "asc" },
    });
    res.json({ capacities });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  "/capacity/:date",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  validate(dailyCapacitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cap = await prisma.dailyCapacity.upsert({
        where: { date: req.params.date },
        update: req.body,
        create: req.body,
      });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "CAPACITY_UPDATED", entityType: "DailyCapacity", entityId: req.params.date, after: req.body, ipAddress: req.ip });
      res.json({ capacity: cap });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Users ────────────────────────────────────────────────────────────────────

adminRouter.get("/users", requireRole(UserRole.ADMIN), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true },
      orderBy: { email: "asc" },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  "/users",
  requireRole(UserRole.ADMIN),
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const passwordHash = await bcrypt.hash(req.body.password, config.BCRYPT_ROUNDS);
      const user = await prisma.user.create({
        data: { email: req.body.email, passwordHash, role: req.body.role, isActive: true },
        select: { id: true, email: true, role: true, isActive: true },
      });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "USER_CREATED", entityType: "User", entityId: user.id, after: { email: user.email, role: user.role }, ipAddress: req.ip });
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.patch(
  "/users/:id",
  requireRole(UserRole.ADMIN),
  validate(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
        select: { id: true, email: true, role: true, isActive: true },
      });
      // If deactivating or changing role, revoke existing tokens
      if (req.body.isActive === false || req.body.role) {
        await prisma.user.update({ where: { id: req.params.id }, data: { tokenVersion: { increment: 1 } } });
      }
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "USER_UPDATED", entityType: "User", entityId: user.id, after: req.body, ipAddress: req.ip });
      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
);

// Force logout (increment tokenVersion)
adminRouter.post(
  "/users/:id/force-logout",
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.user.update({
        where: { id: req.params.id },
        data: { tokenVersion: { increment: 1 } },
      });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "USER_FORCE_LOGOUT", entityType: "User", entityId: req.params.id, ipAddress: req.ip });
      res.json({ message: "User sessions revoked" });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Email Templates ──────────────────────────────────────────────────────────

adminRouter.get("/email-templates", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { triggerType: "asc" } });
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  "/email-templates/:triggerType",
  requireRole(UserRole.ADMIN, UserRole.REGISTRAR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subject, bodyHtml, bodyText, isEnabled } = z.object({
        subject: z.string().min(1),
        bodyHtml: z.string().min(1),
        bodyText: z.string().min(1),
        isEnabled: z.boolean(),
      }).parse(req.body);

      const template = await prisma.emailTemplate.update({
        where: { triggerType: req.params.triggerType as any },
        data: { subject, bodyHtml, bodyText, isEnabled },
      });

      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "EMAIL_TEMPLATE_UPDATED", entityType: "EmailTemplate", entityId: req.params.triggerType, after: { subject, isEnabled }, ipAddress: req.ip });
      res.json({ template });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Educator Schedule ────────────────────────────────────────────────────────

// Monthly range summary — one row per day with booking counts for calendar cells
adminRouter.get("/schedule/range", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = z.object({
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);

    const ACTIVE = [PrismaBookingStatus.PENDING, PrismaBookingStatus.CONFIRMED];

    const [bookingsByDate, classByDate] = await Promise.all([
      prisma.booking.groupBy({
        by: ["visitDate"],
        where: { visitDate: { gte: dateFrom, lte: dateTo }, status: { in: ACTIVE } },
        _count: { id: true },
        _sum: { studentCount: true, adultCount: true },
      }),
      prisma.classBooking.groupBy({
        by: ["sessionSlot"],
        where: {
          booking: { visitDate: { gte: dateFrom, lte: dateTo }, status: { in: ACTIVE } },
        },
        _count: { id: true },
      }),
    ]);

    // Get accessibility flags per day
    const accessibilityDays = await prisma.booking.findMany({
      where: {
        visitDate: { gte: dateFrom, lte: dateTo },
        status: { in: ACTIVE },
        accessibilityNeeds: { not: null },
      },
      select: { visitDate: true, accessibilityNeeds: true },
    });

    // Count class sessions per date (need to join through booking)
    const classSessionsByDate = await prisma.classBooking.findMany({
      where: { booking: { visitDate: { gte: dateFrom, lte: dateTo }, status: { in: ACTIVE } } },
      select: { sessionSlot: true, booking: { select: { visitDate: true } } },
    });

    const classCountMap = new Map<string, number>();
    for (const cb of classSessionsByDate) {
      const d = cb.booking.visitDate;
      classCountMap.set(d, (classCountMap.get(d) ?? 0) + 1);
    }

    const accessMap = new Map<string, boolean>();
    for (const b of accessibilityDays) {
      if (b.accessibilityNeeds && b.accessibilityNeeds !== "None") {
        accessMap.set(b.visitDate, true);
      }
    }

    const result = bookingsByDate.map((row) => ({
      date: row.visitDate,
      groupCount: row._count.id,
      totalStudents: row._sum.studentCount ?? 0,
      totalAdults: row._sum.adultCount ?? 0,
      classSessions: classCountMap.get(row.visitDate) ?? 0,
      hasAccessibilityNeeds: accessMap.get(row.visitDate) ?? false,
    }));

    res.json({ days: result });
  } catch (err) {
    next(err);
  }
});

// Full day detail — field trips + class program schedule
adminRouter.get("/schedule/day", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);

    const ACTIVE = [PrismaBookingStatus.PENDING, PrismaBookingStatus.CONFIRMED];

    const bookings = await prisma.booking.findMany({
      where: { visitDate: date, status: { in: ACTIVE } },
      include: {
        classBookings: {
          include: { classOffering: true, instructor: { select: { id: true, email: true } } },
        },
      },
      orderBy: { arrivalTimeSlot: "asc" },
    });

    const decrypted = bookings.map((b) => {
      const dec = decryptBooking(b);
      return {
        id: dec.id,
        status: dec.status,
        groupType: dec.groupType,
        organizationName: dec.organizationName,
        contactName: dec.contactName,
        arrivalTimeSlot: dec.arrivalTimeSlot,
        studentCount: dec.studentCount,
        adultCount: dec.adultCount,
        gradeLevels: dec.gradeLevels,
        accessibilityNeeds: dec.accessibilityNeeds,
        groupNotes: (dec as any).groupNotes ?? null,
        internalNotes: dec.internalNotes,
        classSession: dec.classBookings[0]
          ? {
              classBookingId: dec.classBookings[0].id,
              offeringId: dec.classBookings[0].classOfferingId,
              offeringName: dec.classBookings[0].classOffering?.name ?? "",
              sessionSlot: dec.classBookings[0].sessionSlot,
              durationMinutes: dec.classBookings[0].classOffering?.durationMinutes ?? 60,
              resourceRequirements: dec.classBookings[0].classOffering?.resourceRequirements ?? null,
              instructorId: dec.classBookings[0].instructorId ?? null,
              instructorEmail: (dec.classBookings[0] as any).instructor?.email ?? null,
            }
          : null,
      };
    });

    // Build class program schedule — group by sessionSlot + offeringId
    const sessionMap = new Map<string, {
      sessionSlot: string;
      offeringId: string;
      offeringName: string;
      durationMinutes: number;
      resourceRequirements: string | null;
      instructorId: string | null;
      instructorEmail: string | null;
      classBookingIds: string[];
      groups: Array<{ bookingId: string; classBookingId: string | null; organizationName: string; studentCount: number; gradeLevels: string[] }>;
    }>();

    for (const b of decrypted) {
      if (!b.classSession) continue;
      const key = `${b.classSession.sessionSlot}::${b.classSession.offeringId}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          sessionSlot: b.classSession.sessionSlot,
          offeringId: b.classSession.offeringId,
          offeringName: b.classSession.offeringName,
          durationMinutes: b.classSession.durationMinutes,
          resourceRequirements: b.classSession.resourceRequirements,
          instructorId: b.classSession.instructorId,
          instructorEmail: b.classSession.instructorEmail,
          classBookingIds: [],
          groups: [],
        });
      }
      const entry = sessionMap.get(key)!;
      if (b.classSession.classBookingId) {
        entry.classBookingIds.push(b.classSession.classBookingId);
      }
      entry.groups.push({
        bookingId: b.id,
        classBookingId: b.classSession.classBookingId,
        organizationName: b.organizationName,
        studentCount: b.studentCount,
        gradeLevels: b.gradeLevels,
      });
    }

    const classSessions = Array.from(sessionMap.values()).sort(
      (a, b) => a.sessionSlot.localeCompare(b.sessionSlot)
    );

    const summary = {
      groupCount: decrypted.length,
      totalStudents: decrypted.reduce((s, b) => s + b.studentCount, 0),
      totalAdults: decrypted.reduce((s, b) => s + b.adultCount, 0),
      classSessionCount: classSessions.length,
      hasAccessibilityNeeds: decrypted.some(
        (b) => b.accessibilityNeeds && b.accessibilityNeeds !== "None"
      ),
      pendingCount: decrypted.filter((b) => b.status === "PENDING").length,
    };

    res.json({ date, summary, fieldTrips: decrypted, classSessions });
  } catch (err) {
    next(err);
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────

adminRouter.get("/settings", requireRole(UserRole.ADMIN), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  "/settings/:key",
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { value } = z.object({ value: z.string() }).parse(req.body);
      const setting = await prisma.appSetting.upsert({
        where: { key: req.params.key },
        update: { value },
        create: { key: req.params.key, value },
      });
      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "SETTING_UPDATED", entityType: "AppSetting", entityId: req.params.key, after: { value }, ipAddress: req.ip });
      res.json({ setting });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Audit Log ────────────────────────────────────────────────────────────────

adminRouter.get("/audit-log", requireRole(UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

adminRouter.get("/analytics/bookings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { seasonStartDate, seasonEndDate, format } = z.object({
      seasonStartDate: z.string().optional(),
      seasonEndDate: z.string().optional(),
      format: z.enum(["json", "csv"]).default("json"),
    }).parse(req.query);

    const dateFilter = seasonStartDate && seasonEndDate
      ? { visitDate: { gte: seasonStartDate, lte: seasonEndDate } }
      : {};
    const confirmedFilter = { ...dateFilter, status: { in: ["CONFIRMED", "COMPLETED"] as any } };

    if (format === "csv") {
      const bookings = await prisma.booking.findMany({
        where: dateFilter,
        orderBy: { visitDate: "asc" },
        include: { classBookings: { include: { classOffering: true } }, scholarshipApplication: true },
      });

      const rows = bookings.map((b: any) => {
        const dec = decryptBooking(b);
        return [
          b.visitDate, b.arrivalTimeSlot ?? "", dec.organizationName ?? "", dec.schoolDistrict ?? "",
          b.groupType, b.status, b.studentCount, b.adultCount, b.studentCount + b.adultCount,
          b.gradeLevels.join("; "), b.paymentMethod ?? "", b.scholarshipApplication?.status ?? "",
          b.transportationReimbursementRequested ? "Yes" : "No",
          b.classBookings?.[0]?.classOffering?.name ?? "",
          dec.contactName ?? "", dec.contactEmail ?? "", b.acmeOrderNumber ?? "",
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
      });

      const header = ["Date","Time","Organization","District","Group Type","Status","Students","Adults","Total","Grades","Payment","Scholarship","Transport Reimb","Program","Contact Name","Contact Email","ACME Order"].join(",");
      const csv = [header, ...rows].join("\n");
      const filename = seasonStartDate && seasonEndDate ? `analytics-${seasonStartDate}-to-${seasonEndDate}.csv` : `analytics-all.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    // Fetch per-student revenue setting
    const revenueSetting = await prisma.appSetting.findUnique({ where: { key: "per_student_revenue" } });
    const perStudentRevenue = parseFloat(revenueSetting?.value ?? "0");

    const transportBudgetSetting = await prisma.appSetting.findUnique({ where: { key: "transportation_budget_per_season" } });
    const transportBudget = parseFloat(transportBudgetSetting?.value ?? "0");

    const [
      totalByStatus,
      totalByGroupType,
      totalByPaymentMethod,
      confirmedAggregates,
      confirmedBookings,
      scholarshipStats,
      transportStats,
      monthlyVisits,
    ] = await prisma.$transaction([
      prisma.booking.groupBy({ by: ["status"], _count: true, where: dateFilter, orderBy: { status: "asc" } }),
      prisma.booking.groupBy({ by: ["groupType"], _count: true, where: confirmedFilter, orderBy: { groupType: "asc" } }),
      prisma.booking.groupBy({ by: ["paymentMethod"], _count: true, where: confirmedFilter, orderBy: { paymentMethod: "asc" } }),
      prisma.booking.aggregate({
        where: confirmedFilter,
        _sum: { studentCount: true, adultCount: true },
        _count: true,
        _avg: { studentCount: true },
      }),
      // For unique orgs + grade breakdown we need raw data
      prisma.booking.findMany({
        where: confirmedFilter,
        select: {
          organizationName: true, schoolDistrict: true, gradeLevels: true,
          studentCount: true, adultCount: true, paymentMethod: true,
          visitDate: true, createdAt: true,
          scholarshipApplication: { select: { status: true } },
          busReimbursement: { select: { amountApproved: true, status: true } },
        },
        take: 5000,
      }),
      prisma.scholarshipApplication.groupBy({ by: ["status"], _count: true, where: { booking: dateFilter }, orderBy: { status: "asc" } }),
      prisma.busReimbursement.aggregate({
        where: { booking: dateFilter, status: { in: ["SUBMITTED", "PROCESSED"] as any } },
        _count: true,
        _sum: { amountApproved: true },
      }),
      prisma.booking.groupBy({
        by: ["visitDate"],
        where: confirmedFilter,
        _count: true,
        _sum: { studentCount: true, adultCount: true },
        orderBy: { visitDate: "asc" },
      }),
    ]);

    // Decrypt org names for unique-org count
    const decryptedBookings = confirmedBookings.map((b: any) => ({
      ...b,
      organizationName: (() => { try { return decrypt(b.organizationName); } catch { return b.organizationName; } })(),
      schoolDistrict: b.schoolDistrict,
    }));

    const uniqueOrgs = new Set(decryptedBookings.map((b: any) => b.organizationName.toLowerCase().trim())).size;
    const uniqueDistricts = new Set(
      decryptedBookings.filter((b: any) => b.schoolDistrict).map((b: any) => b.schoolDistrict!.toLowerCase().trim())
    ).size;

    // Grade level breakdown (across all confirmed bookings)
    const gradeCounts: Record<string, number> = {};
    for (const b of decryptedBookings) {
      for (const grade of b.gradeLevels) {
        gradeCounts[grade] = (gradeCounts[grade] ?? 0) + b.studentCount / Math.max(b.gradeLevels.length, 1);
      }
    }
    const gradeBreakdown = Object.entries(gradeCounts)
      .map(([grade, count]) => ({ grade, count: Math.round(count) }))
      .sort((a, b) => b.count - a.count);

    // Revenue: non-scholarship confirmed bookings × per_student_revenue
    const payingStudents = decryptedBookings
      .filter((b: any) => b.paymentMethod !== "SCHOLARSHIP")
      .reduce((s: number, b: any) => s + b.studentCount, 0);
    const estimatedRevenue = payingStudents * perStudentRevenue;

    // Average lead time (days from createdAt to visitDate)
    const leadTimes = decryptedBookings.map((b: any) => {
      const created = new Date(b.createdAt);
      const visit = new Date(b.visitDate + "T00:00:00Z");
      return Math.max(0, Math.round((visit.getTime() - created.getTime()) / 86400000));
    });
    const avgLeadTimeDays = leadTimes.length > 0 ? Math.round(leadTimes.reduce((s, n) => s + n, 0) / leadTimes.length) : 0;

    // Top school districts
    const districtMap: Record<string, number> = {};
    for (const b of decryptedBookings) {
      if (b.schoolDistrict?.trim()) {
        const d = b.schoolDistrict.trim();
        districtMap[d] = (districtMap[d] ?? 0) + 1;
      }
    }
    const topDistricts = Object.entries(districtMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([district, count]) => ({ district, count }));

    // Cancellation rate
    const totalSubmitted = totalByStatus.reduce((s: number, r: any) => s + r._count, 0);
    const cancelledCount = Number((totalByStatus.find((r: any) => r.status === "CANCELLED") as any)?._count ?? 0);
    const cancellationRate = totalSubmitted > 0 ? Math.round((cancelledCount / totalSubmitted) * 100) : 0;

    const totalStudents = confirmedAggregates._sum.studentCount ?? 0;
    const totalAdults = confirmedAggregates._sum.adultCount ?? 0;

    res.json({
      // Summary stats
      totalConfirmedBookings: confirmedAggregates._count,
      uniqueOrganizations: uniqueOrgs,
      uniqueDistricts,
      totalStudents,
      totalAdults,
      totalVisitors: totalStudents + totalAdults,
      avgGroupSize: Math.round(confirmedAggregates._avg.studentCount ?? 0),
      avgLeadTimeDays,
      cancellationRate,
      // Revenue
      perStudentRevenue,
      payingStudents,
      estimatedRevenue,
      // Scholarship
      scholarshipStats,
      // Transportation
      transportBudget,
      transportReimbursementsCount: transportStats._count,
      transportTotalApproved: Number(transportStats._sum.amountApproved ?? 0),
      // Breakdowns
      totalByStatus,
      totalByGroupType,
      totalByPaymentMethod,
      gradeBreakdown,
      topDistricts,
      monthlyVisits,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Email Journeys ───────────────────────────────────────────────────────────

adminRouter.get("/journeys", requireRole(UserRole.ADMIN, UserRole.REGISTRAR), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const journeys = await prisma.emailJourney.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    res.json({ journeys });
  } catch (err) { next(err); }
});

adminRouter.post("/journeys", requireRole(UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, trigger, isEnabled, steps, sortOrder } = z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(500).default(""),
      trigger: z.enum(["BOOKING_SUBMITTED","BOOKING_CONFIRMED","BOOKING_DECLINED","BOOKING_RESCHEDULED_BY_ADMIN","BOOKING_RESCHEDULED_BY_BOOKER","BOOKING_CANCELLED"]),
      isEnabled: z.boolean().default(true),
      steps: z.array(z.any()).default([]),
      sortOrder: z.number().int().default(0),
    }).parse(req.body);
    const journey = await prisma.emailJourney.create({ data: { name, description, trigger: trigger as any, isEnabled, steps, sortOrder } });
    await auditLog({ actorId: req.user!.id, actorType: "USER", action: "JOURNEY_CREATED", entityType: "EmailJourney", entityId: journey.id, after: { name, trigger }, ipAddress: req.ip });
    res.status(201).json({ journey });
  } catch (err) { next(err); }
});

adminRouter.put("/journeys/:id", requireRole(UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, isEnabled, steps, sortOrder } = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(500).optional(),
      isEnabled: z.boolean().optional(),
      steps: z.array(z.any()).optional(),
      sortOrder: z.number().int().optional(),
    }).parse(req.body);
    const journey = await prisma.emailJourney.update({
      where: { id: req.params.id },
      data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(isEnabled !== undefined && { isEnabled }), ...(steps !== undefined && { steps }), ...(sortOrder !== undefined && { sortOrder }) },
    });
    res.json({ journey });
  } catch (err) { next(err); }
});

adminRouter.delete("/journeys/:id", requireRole(UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.emailJourney.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Process due scheduled emails (called by external cron or admin manually)
adminRouter.post("/journeys/process-queue", requireRole(UserRole.ADMIN), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { processScheduledEmails } = await import("../services/journeyService");
    const result = await processScheduledEmails();
    res.json(result);
  } catch (err) { next(err); }
});
