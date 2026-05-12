import "./setup"; // must be first — sets env vars
import request from "supertest";
import { createApp } from "../../app";
import { prisma, truncateAllTables, seedTestData } from "./setup";

const app = createApp();

beforeAll(async () => {
  await truncateAllTables();
  await seedTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const VALID_BOOKING = {
  groupType: "SCHOOL",
  organizationName: "Lincoln Elementary",
  contactName: "Alice Teacher",
  contactEmail: "alice@lincoln.edu",
  contactPhone: "206-555-1000",
  gradeLevels: ["3rd Grade", "4th Grade"],
  studentCount: 25,
  adultCount: 5,
  visitDate: "2026-04-15",
  arrivalTimeSlot: "09:00",
  paymentMethod: "PAID",
  cocAcknowledged: true,
};

describe("GET /api/v1/public/availability", () => {
  it("returns calendar data and time slots", async () => {
    const res = await request(app)
      .get("/api/v1/public/availability")
      .query({ startDate: "2026-04-01", endDate: "2026-04-07", groupSize: 30 });

    expect(res.status).toBe(200);
    expect(res.body.calendar).toHaveLength(7);
    expect(res.body.timeSlots).toContain("09:00");
    expect(res.body.calendar[0]).toMatchObject({
      date: "2026-04-01",
      isAvailable: true,
      isBlackout: false,
    });
  });

  it("marks blackout dates as unavailable", async () => {
    await prisma.dailyCapacity.create({
      data: { date: "2026-04-02", capacityLimit: 300, isBlackout: true, note: "Staff event" },
    });

    const res = await request(app)
      .get("/api/v1/public/availability")
      .query({ startDate: "2026-04-02", endDate: "2026-04-02", groupSize: 1 });

    expect(res.status).toBe(200);
    expect(res.body.calendar[0].isBlackout).toBe(true);
    expect(res.body.calendar[0].isAvailable).toBe(false);

    await prisma.dailyCapacity.delete({ where: { date: "2026-04-02" } });
  });

  it("marks date unavailable when group size exceeds remaining capacity", async () => {
    // Create confirmed booking that fills the date
    await prisma.dailyCapacity.create({
      data: { date: "2026-04-03", capacityLimit: 20 },
    });

    const res = await request(app)
      .get("/api/v1/public/availability")
      .query({ startDate: "2026-04-03", endDate: "2026-04-03", groupSize: 25 });

    expect(res.body.calendar[0].isAvailable).toBe(false);
    await prisma.dailyCapacity.delete({ where: { date: "2026-04-03" } });
  });
});

describe("GET /api/v1/public/classes", () => {
  it("returns active class offerings", async () => {
    const res = await request(app).get("/api/v1/public/classes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.classes)).toBe(true);
    expect(res.body.classes[0]).toMatchObject({
      id: "class-test",
      name: "Test Class",
      isActive: true,
    });
  });
});

describe("POST /api/v1/public/bookings", () => {
  it("creates a confirmed booking for a standard paid group", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send(VALID_BOOKING);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.bookingId).toBeTruthy();
    expect(res.body.rescheduleToken).toBeTruthy();

    // Verify record in DB (PII is encrypted so we check non-PII fields)
    const booking = await prisma.booking.findUnique({ where: { id: res.body.bookingId } });
    expect(booking).not.toBeNull();
    expect(booking!.studentCount).toBe(25);
    expect(booking!.visitDate).toBe("2026-04-15");
    expect(booking!.status).toBe("CONFIRMED");
    // PII should be encrypted (not plaintext)
    expect(booking!.contactEmail).not.toBe("alice@lincoln.edu");
    expect(booking!.contactEmail).toContain(":");
  });

  it("creates a PENDING booking when scholarship is requested", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({
        ...VALID_BOOKING,
        visitDate: "2026-04-16",
        paymentMethod: "SCHOLARSHIP",
        scholarship: {
          titleOneStatus: true,
          enrollmentCount: 400,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");

    const scholarship = await prisma.scholarshipApplication.findFirst({
      where: { bookingId: res.body.bookingId },
    });
    expect(scholarship).not.toBeNull();
    expect(scholarship!.titleOneStatus).toBe(true);
  });

  it("creates a PENDING booking when accessibility needs are stated", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({
        ...VALID_BOOKING,
        visitDate: "2026-04-17",
        accessibilityNeeds: "Wheelchair access required for 3 students",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  it("returns 400 with field errors for missing required fields", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({
        groupType: "SCHOOL",
        // missing everything else
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toBeDefined();
    expect(Object.keys(res.body.error.fields).length).toBeGreaterThan(0);
  });

  it("returns 400 when cocAcknowledged is false", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2026-04-18", cocAcknowledged: false });

    expect(res.status).toBe(400);
    expect(res.body.error.fields?.cocAcknowledged).toBeTruthy();
  });

  it("returns 400 when scholarship paymentMethod is used without scholarship data", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({
        ...VALID_BOOKING,
        visitDate: "2026-04-19",
        paymentMethod: "SCHOLARSHIP",
        // scholarship field omitted
      });

    expect(res.status).toBe(400);
  });

  it("silently succeeds when honeypot field is filled (bot detection)", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2026-04-20", website: "http://spam.example.com" });

    // Returns 201 but no real booking created
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");

    // No booking should be in the database for this email on this date
    const count = await prisma.booking.count({ where: { visitDate: "2026-04-20" } });
    expect(count).toBe(0);
  });

  it("returns 409 CAPACITY_EXCEEDED when daily capacity is full", async () => {
    // Set a tiny capacity for a fresh date
    await prisma.dailyCapacity.create({ data: { date: "2026-05-01", capacityLimit: 10 } });

    // First booking fills it
    const first = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2026-05-01", studentCount: 8, adultCount: 2 });
    expect(first.status).toBe(201);

    // Second booking exceeds capacity
    const second = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2026-05-01", studentCount: 1, adultCount: 0 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CAPACITY_EXCEEDED");

    await prisma.dailyCapacity.delete({ where: { date: "2026-05-01" } });
  });

  it("returns 422 REGISTRATION_CLOSED when no published season covers the date", async () => {
    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2030-06-01" }); // outside season range

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });

  it("returns 409 DATE_BLACKOUT for a blackout date", async () => {
    await prisma.dailyCapacity.create({
      data: { date: "2026-05-05", capacityLimit: 300, isBlackout: true },
    });

    const res = await request(app)
      .post("/api/v1/public/bookings")
      .send({ ...VALID_BOOKING, visitDate: "2026-05-05" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DATE_BLACKOUT");

    await prisma.dailyCapacity.delete({ where: { date: "2026-05-05" } });
  });
});
