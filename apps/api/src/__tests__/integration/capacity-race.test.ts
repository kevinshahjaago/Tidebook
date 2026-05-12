import "./setup";
import request from "supertest";
import { createApp } from "../../app";
import { prisma, truncateAllTables, seedTestData } from "./setup";

/**
 * Concurrent booking race condition test.
 *
 * Two simultaneous POST requests compete for the last available spot on a date.
 * The capacity engine uses SELECT FOR UPDATE (pg_advisory_xact_lock) inside a
 * Prisma transaction to serialize the writes. Exactly one request must succeed
 * with HTTP 201 and the other must fail with HTTP 409 CAPACITY_EXCEEDED.
 */

const app = createApp();

beforeAll(async () => {
  await truncateAllTables();
  await seedTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const RACE_DATE = "2026-07-04";

const makeBooking = (studentCount: number, adultCount: number) =>
  request(app)
    .post("/api/v1/public/bookings")
    .send({
      groupType: "SCHOOL",
      organizationName: `Race Test School`,
      contactName: "Race Tester",
      contactEmail: `race${Date.now()}@test.edu`,
      contactPhone: "206-555-7777",
      gradeLevels: ["5th Grade"],
      studentCount,
      adultCount,
      visitDate: RACE_DATE,
      arrivalTimeSlot: "10:00",
      paymentMethod: "PAID",
      cocAcknowledged: true,
    });

describe("Capacity race condition — concurrent bookings for last available spot", () => {
  beforeEach(async () => {
    // Set capacity to exactly 30 for this date
    await prisma.dailyCapacity.upsert({
      where: { date: RACE_DATE },
      update: { capacityLimit: 30 },
      create: { date: RACE_DATE, capacityLimit: 30 },
    });
    // Clear any existing bookings on this date
    await prisma.booking.deleteMany({ where: { visitDate: RACE_DATE } });
  });

  it("allows only one of two concurrent bookings when combined size equals capacity", async () => {
    // Two groups each wanting 15 students + 0 adults = 15 each.
    // Combined = 30 = exactly capacity. Only one can fit.
    const [res1, res2] = await Promise.all([
      makeBooking(15, 0),
      makeBooking(15, 0),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failRes = res1.status === 409 ? res1 : res2;

    expect(successRes.body.bookingId).toBeTruthy();
    expect(failRes.body.error.code).toBe("CAPACITY_EXCEEDED");

    // Exactly one booking should be in the database
    const count = await prisma.booking.count({
      where: { visitDate: RACE_DATE, status: { in: ["CONFIRMED", "PENDING"] } },
    });
    expect(count).toBe(1);
  });

  it("allows only one of three concurrent bookings when all three would overflow capacity", async () => {
    // Three groups each wanting 15 students. First one fills capacity (15 < 30),
    // second fills completely (30 = 30), third must be rejected.
    // Actually let's make each group 20 so only one fits (20 < 30, 40 > 30).
    const [r1, r2, r3] = await Promise.all([
      makeBooking(20, 0),
      makeBooking(20, 0),
      makeBooking(20, 0),
    ]);

    const results = [r1, r2, r3];
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(2);

    failures.forEach((f) => {
      expect(f.body.error.code).toBe("CAPACITY_EXCEEDED");
    });

    const count = await prisma.booking.count({
      where: { visitDate: RACE_DATE, status: { in: ["CONFIRMED", "PENDING"] } },
    });
    expect(count).toBe(1);
  });

  it("never exceeds daily capacity limit regardless of concurrency", async () => {
    // Fire 10 concurrent requests, each for 10 students.
    // Capacity = 30, so max 3 should succeed (30/10 = 3).
    const promises = Array.from({ length: 10 }, () => makeBooking(10, 0));
    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 409);

    expect(successes.length).toBeLessThanOrEqual(3);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(failures.length).toBeGreaterThanOrEqual(7);

    // Verify DB total never exceeds capacity
    const agg = await prisma.booking.aggregate({
      where: { visitDate: RACE_DATE, status: { in: ["CONFIRMED", "PENDING"] } },
      _sum: { studentCount: true, adultCount: true },
    });
    const total = (agg._sum.studentCount ?? 0) + (agg._sum.adultCount ?? 0);
    expect(total).toBeLessThanOrEqual(30);
  });
});
