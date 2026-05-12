import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { requireConnectionsAuth } from "../middleware/auth";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createConnectionsBookingSchema, UserRole } from "@tidebook/shared";
import { createBooking } from "../services/bookingService";
import { authRateLimit } from "../middleware/rateLimiter";
import bcrypt from "bcrypt";
import { config } from "../config";
import { GroupType } from "@prisma/client";
import { auditLog } from "../services/auditService";
import { decrypt } from "../utils/encryption";
import { z } from "zod";

export const connectionsRouter = Router();

// ─── Connections Partner Auth ─────────────────────────────────────────────────

connectionsRouter.post("/auth/login", authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);

    const partner = await prisma.connectionsPartner.findUnique({ where: { contactEmail: email } });

    if (!partner || !partner.isActive) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
      return;
    }

    if (partner.lockedUntil && partner.lockedUntil > new Date()) {
      res.status(401).json({ error: { code: "ACCOUNT_LOCKED", message: "Account temporarily locked" } });
      return;
    }

    const valid = await bcrypt.compare(password, partner.passwordHash);
    if (!valid) {
      const attempts = partner.failedLoginAttempts + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null;
      await prisma.connectionsPartner.update({
        where: { id: partner.id },
        data: { failedLoginAttempts: attempts, ...(lockUntil ? { lockedUntil: lockUntil } : {}) },
      });
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } });
      return;
    }

    await prisma.connectionsPartner.update({
      where: { id: partner.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const jwt = await import("jsonwebtoken");
    const accessToken = jwt.default.sign(
      { sub: partner.id, type: "connections", tokenVersion: partner.tokenVersion },
      config.JWT_ACCESS_SECRET,
      { expiresIn: "15m" }
    );

    res.json({
      accessToken,
      partner: {
        id: partner.id,
        organizationName: partner.organizationName,
        contactName: partner.contactName,
        contactEmail: partner.contactEmail,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Connections Partner Bookings ─────────────────────────────────────────────

connectionsRouter.post(
  "/bookings",
  requireConnectionsAuth,
  validate(createConnectionsBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partner = await prisma.connectionsPartner.findUnique({
        where: { id: req.connectionsPartner!.id },
      });

      if (!partner) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
        return;
      }

      const input = {
        ...req.body,
        organizationName: partner.organizationName,
        groupType: GroupType.CONNECTIONS,
        paymentMethod: "INVOICE",
      };

      const result = await createBooking(input, req.ip, partner.id);
      res.status(201).json({
        bookingId: result.booking.id,
        status: result.booking.status,
        visitDate: result.booking.visitDate,
      });
    } catch (err) {
      next(err);
    }
  }
);

connectionsRouter.get(
  "/bookings",
  requireConnectionsAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookings = await prisma.booking.findMany({
        where: { connectionsPartnerId: req.connectionsPartner!.id },
        orderBy: { visitDate: "desc" },
        include: { classBookings: { include: { classOffering: true } } },
      });
      res.json({ bookings });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Admin: Connections Partner Management ────────────────────────────────────

connectionsRouter.get(
  "/admin/partners",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.CONNECTIONS_COORDINATOR),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const partners = await prisma.connectionsPartner.findMany({
        select: { id: true, organizationName: true, contactName: true, contactEmail: true, isActive: true, raisersEdgeId: true },
        orderBy: { organizationName: "asc" },
      });
      res.json({ partners });
    } catch (err) {
      next(err);
    }
  }
);

connectionsRouter.post(
  "/admin/partners",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.CONNECTIONS_COORDINATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationName, contactName, contactEmail, password, raisersEdgeId } = z.object({
        organizationName: z.string().min(2),
        contactName: z.string().min(2),
        contactEmail: z.string().email(),
        password: z.string().min(12),
        raisersEdgeId: z.string().optional(),
      }).parse(req.body);

      const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
      const partner = await prisma.connectionsPartner.create({
        data: { organizationName, contactName, contactEmail, passwordHash, raisersEdgeId, createdById: req.user!.id },
        select: { id: true, organizationName: true, contactEmail: true },
      });

      await auditLog({ actorId: req.user!.id, actorType: "USER", action: "PARTNER_CREATED", entityType: "ConnectionsPartner", entityId: partner.id, after: { organizationName, contactEmail }, ipAddress: req.ip });
      res.status(201).json({ partner });
    } catch (err) {
      next(err);
    }
  }
);

// Raiser's Edge CSV export
connectionsRouter.get(
  "/admin/partners/export",
  requireAuth,
  requireRole(UserRole.ADMIN, UserRole.CONNECTIONS_COORDINATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dateFrom, dateTo } = z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).parse(req.query);

      const bookings = await prisma.booking.findMany({
        where: {
          groupType: "CONNECTIONS",
          status: { in: ["CONFIRMED", "COMPLETED"] },
          ...(dateFrom || dateTo
            ? { visitDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
            : {}),
        },
        include: { connectionsPartner: true },
        orderBy: { visitDate: "asc" },
      });

      const rows = bookings.map((b) => ({
        raisersEdgeId: b.connectionsPartner?.raisersEdgeId ?? "",
        organizationName: decrypt(b.organizationName),
        contactName: decrypt(b.contactName),
        contactEmail: decrypt(b.contactEmail),
        visitDate: b.visitDate,
        groupSize: b.studentCount + b.adultCount,
        students: b.studentCount,
        adults: b.adultCount,
        bookingId: b.id,
        acmeOrderNumber: b.acmeOrderNumber ?? "",
      }));

      const header = Object.keys(rows[0] ?? {}).join(",");
      const csvRows = rows.map((r) =>
        Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="connections-raisers-edge-${Date.now()}.csv"`);
      res.send([header, ...csvRows].join("\n"));
    } catch (err) {
      next(err);
    }
  }
);
