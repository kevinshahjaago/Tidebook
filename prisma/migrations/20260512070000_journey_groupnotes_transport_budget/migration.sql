-- Rename specialRequests → groupNotes on Booking
ALTER TABLE "Booking" RENAME COLUMN "specialRequests" TO "groupNotes";

-- Email journey trigger + status enums
CREATE TYPE "JourneyTrigger" AS ENUM (
  'BOOKING_SUBMITTED',
  'BOOKING_CONFIRMED',
  'BOOKING_DECLINED',
  'BOOKING_RESCHEDULED_BY_ADMIN',
  'BOOKING_RESCHEDULED_BY_BOOKER',
  'BOOKING_CANCELLED'
);

CREATE TYPE "ScheduledEmailStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- Email journey definitions (admin-configurable)
CREATE TABLE "EmailJourney" (
  "id"          TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "description" TEXT        NOT NULL DEFAULT '',
  "trigger"     "JourneyTrigger" NOT NULL,
  "isEnabled"   BOOLEAN     NOT NULL DEFAULT true,
  "steps"       JSONB       NOT NULL DEFAULT '[]',
  "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailJourney_pkey" PRIMARY KEY ("id")
);

-- Scheduled emails queue (one row per action per booking)
CREATE TABLE "ScheduledEmail" (
  "id"           TEXT        NOT NULL,
  "bookingId"    TEXT        NOT NULL,
  "journeyId"    TEXT        NOT NULL,
  "stepId"       TEXT        NOT NULL,
  "templateType" "EmailTriggerType" NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt"       TIMESTAMP(3),
  "status"       "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScheduledEmail"
  ADD CONSTRAINT "ScheduledEmail_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ScheduledEmail_status_scheduledFor_idx" ON "ScheduledEmail"("status", "scheduledFor");
CREATE INDEX "ScheduledEmail_bookingId_idx"            ON "ScheduledEmail"("bookingId");
CREATE INDEX "EmailJourney_trigger_idx"                ON "EmailJourney"("trigger");

-- Transportation budget per-season tracking
ALTER TABLE "BusReimbursement" ADD COLUMN "seasonKey" TEXT;
CREATE INDEX "BusReimbursement_seasonKey_idx" ON "BusReimbursement"("seasonKey");
