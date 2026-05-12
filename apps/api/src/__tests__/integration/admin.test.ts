import "./setup";
import request from "supertest";
import { createApp } from "../../app";
import { prisma, truncateAllTables, seedTestData } from "./setup";
import { encrypt } from "../../utils/encryption";

const app = createApp();
let adminToken: string;

beforeAll(async () => {
  await truncateAllTables();
  await seedTestData();

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@test.com", password: "TestPass123!" });
  adminToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createTestBooking(overrides: Record<string, unknown> = {}) {
  return prisma.booking.create({
    data: {
      status: "PENDING",
      groupType: "SCHOOL",
      organizationName: encrypt("Test School"),
      contactName: encrypt("Test Teacher"),
      contactEmail: encrypt("test@school.edu"),
      contactPhone: encrypt("206-555-9999"),
      gradeLevels: ["3rd Grade"],
      studentCount: 20,
      adultCount: 4,
      visitDate: "2026-06-10",
      arrivalTimeSlot: "09:00",
      paymentMethod: "PAID",
      cocAcknowledged: true,
      ...overrides,
    },
  });
}

describe("GET /api/v1/admin/bookings", () => {
  it("returns paginated bookings list", async () => {
    await createTestBooking();

    const res = await request(app)
      .get("/api/v1/admin/bookings")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by status", async () => {
    await createTestBooking({ visitDate: "2026-06-11", status: "CONFIRMED" });

    const res = await request(app)
      .get("/api/v1/admin/bookings")
      .query({ status: "CONFIRMED" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((b: any) => b.status === "CONFIRMED")).toBe(true);
  });

  it("decrypts PII fields in response", async () => {
    const res = await request(app)
      .get("/api/v1/admin/bookings")
      .set("Authorization", `Bearer ${adminToken}`);

    const booking = res.body.data[0];
    expect(booking.contactEmail).toContain("@");
    expect(booking.contactName).not.toContain(":");
  });
});

describe("POST /api/v1/admin/bookings/:id/confirm", () => {
  it("confirms a pending booking and sets confirmedAt", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-12" });

    const res = await request(app)
      .post(`/api/v1/admin/bookings/${booking.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ internalNotes: "Confirmed by admin test" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Booking confirmed");

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(updated!.status).toBe("CONFIRMED");
    expect(updated!.confirmedAt).not.toBeNull();
    expect(updated!.confirmedById).toBe("user-admin-test");
    expect(updated!.internalNotes).toBe("Confirmed by admin test");
  });

  it("returns 404 for non-existent booking", async () => {
    const res = await request(app)
      .post("/api/v1/admin/bookings/non-existent-id/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("creates an audit log entry for confirmation", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-13" });

    await request(app)
      .post(`/api/v1/admin/bookings/${booking.id}/confirm`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityId: booking.id, action: "BOOKING_CONFIRMED" },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.actorId).toBe("user-admin-test");
  });
});

describe("POST /api/v1/admin/bookings/:id/decline", () => {
  it("declines a booking with a reason", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-14" });

    const res = await request(app)
      .post(`/api/v1/admin/bookings/${booking.id}/decline`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Date unavailable due to special event." });

    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(updated!.status).toBe("DECLINED");
    expect(updated!.declinedReason).toBe("Date unavailable due to special event.");
    expect(updated!.declinedAt).not.toBeNull();
  });

  it("returns 400 when reason is too short", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-15" });

    const res = await request(app)
      .post(`/api/v1/admin/bookings/${booking.id}/decline`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "short" }); // min 10 chars

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/v1/admin/scholarships/:id/review", () => {
  it("approves a scholarship application", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-16", paymentMethod: "SCHOLARSHIP" });
    const scholarship = await prisma.scholarshipApplication.create({
      data: {
        bookingId: booking.id,
        titleOneStatus: true,
        enrollmentCount: 300,
        status: "SUBMITTED",
      },
    });

    const res = await request(app)
      .post(`/api/v1/admin/scholarships/${scholarship.id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "APPROVED", notes: "Qualifies under Title I", budgetAllocated: 500 });

    expect(res.status).toBe(200);

    const updated = await prisma.scholarshipApplication.findUnique({ where: { id: scholarship.id } });
    expect(updated!.status).toBe("APPROVED");
    expect(Number(updated!.budgetAllocated)).toBe(500);
    expect(updated!.reviewedById).toBe("user-admin-test");
  });

  it("denies a scholarship application", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-17", paymentMethod: "SCHOLARSHIP" });
    const scholarship = await prisma.scholarshipApplication.create({
      data: {
        bookingId: booking.id,
        titleOneStatus: false,
        enrollmentCount: 100,
        status: "SUBMITTED",
      },
    });

    const res = await request(app)
      .post(`/api/v1/admin/scholarships/${scholarship.id}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "DENIED", notes: "Does not meet Title I criteria" });

    expect(res.status).toBe(200);

    const updated = await prisma.scholarshipApplication.findUnique({ where: { id: scholarship.id } });
    expect(updated!.status).toBe("DENIED");
  });
});

describe("GET /api/v1/admin/dvl", () => {
  it("returns daily visit log entries as JSON", async () => {
    await createTestBooking({ visitDate: "2026-06-20", status: "CONFIRMED" });

    const res = await request(app)
      .get("/api/v1/admin/dvl")
      .query({ date: "2026-06-20" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({
      date: "2026-06-20",
      groupType: "SCHOOL",
    });
  });

  it("returns CSV when format=csv is specified", async () => {
    const res = await request(app)
      .get("/api/v1/admin/dvl")
      .query({ date: "2026-06-20", format: "csv" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("date,time,groupName");
  });
});

describe("GET /api/v1/admin/bookings/:id", () => {
  it("returns full booking detail with decrypted PII", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-22" });

    const res = await request(app)
      .get(`/api/v1/admin/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(booking.id);
    expect(res.body.contactEmail).toContain("@");
    expect(res.body.contactName).toBe("Test Teacher");
    expect(Array.isArray(res.body.emailLogs)).toBe(true);
  });
});

describe("PATCH /api/v1/admin/bookings/:id/disable-reschedule", () => {
  it("sets rescheduleDisabled to true", async () => {
    const booking = await createTestBooking({ visitDate: "2026-06-23" });

    const res = await request(app)
      .patch(`/api/v1/admin/bookings/${booking.id}/disable-reschedule`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(updated!.rescheduleDisabled).toBe(true);
  });
});
