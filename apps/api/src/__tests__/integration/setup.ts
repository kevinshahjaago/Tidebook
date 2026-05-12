import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

// Load test env before anything else
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://tidebook:testpass@localhost:5433/tidebook_test";
process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
process.env.JWT_ACCESS_SECRET = "test-access-secret-must-be-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-must-be-at-least-32-chars";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.BCRYPT_ROUNDS = "4"; // fast in tests
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "testpass";
process.env.EMAIL_FROM = "test@test.com";
process.env.ACME_USE_MOCK = "true";
process.env.WEB_BASE_URL = "http://localhost:3000";
process.env.API_BASE_URL = "http://localhost:4000";
process.env.CORS_ORIGINS = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.SLOW_QUERY_THRESHOLD_MS = "10000";
process.env.UPLOAD_DIR = "/tmp/tidebook-test-uploads";
process.env.RATE_LIMIT_PUBLIC_MAX = "1000"; // disable rate limiting in tests
process.env.RATE_LIMIT_AUTH_MAX = "1000";

export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

export async function truncateAllTables() {
  const tableNames = [
    "AuditLog",
    "EmailLog",
    "BusReimbursement",
    "ScholarshipApplication",
    "ClassBooking",
    "Booking",
    "ClassOffering",
    "DailyCapacity",
    "Season",
    "MagicLinkToken",
    "ConnectionsPartner",
    "User",
    "EmailTemplate",
    "AppSetting",
  ];

  await prisma.$executeRaw`SET session_replication_role = replica`;
  for (const table of tableNames) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await prisma.$executeRaw`SET session_replication_role = DEFAULT`;
}

export async function seedTestData() {
  // Seed a test admin user
  const bcrypt = await import("bcrypt");
  const passwordHash = await bcrypt.hash("TestPass123!", 4);

  await prisma.user.create({
    data: {
      id: "user-admin-test",
      email: "admin@test.com",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  // Seed an active season covering test dates
  await prisma.season.create({
    data: {
      id: "season-test",
      name: "Test Season",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      registrationOpensAt: new Date("2025-01-01T00:00:00Z"),
      registrationClosesAt: new Date("2027-01-01T00:00:00Z"),
      defaultDailyCapacity: 300,
      isPublished: true,
    },
  });

  // Seed a class offering
  await prisma.classOffering.create({
    data: {
      id: "class-test",
      name: "Test Class",
      description: "Test class description",
      gradeMin: 1,
      gradeMax: 8,
      durationMinutes: 60,
      capacity: 30,
      isActive: true,
    },
  });

  // Seed required email templates (minimal)
  const { EmailTriggerType } = await import("@prisma/client");
  for (const triggerType of Object.values(EmailTriggerType)) {
    await prisma.emailTemplate.create({
      data: {
        triggerType,
        subject: `Test: ${triggerType}`,
        bodyHtml: "<p>Test</p>",
        bodyText: "Test",
        isEnabled: false, // disabled so no real emails in tests
      },
    });
  }

  // Seed app settings
  await prisma.appSetting.createMany({
    data: [
      { key: "cancellation_cutoff_days", value: "5" },
      { key: "limited_availability_threshold", value: "30" },
      { key: "arrival_slot_start", value: "09:00" },
      { key: "arrival_slot_end", value: "14:00" },
      { key: "arrival_slot_interval_minutes", value: "30" },
    ],
  });
}
