-- Booking new columns
ALTER TABLE "Booking"
  ADD COLUMN "dayOfContactEmail" TEXT,
  ADD COLUMN "dayOfContactRole" TEXT,
  ADD COLUMN "accessibilityData" TEXT,
  ADD COLUMN "transportationReimbursementRequested" BOOLEAN NOT NULL DEFAULT false;

-- ScholarshipApplication: add qualifications + defaults for existing required fields
ALTER TABLE "ScholarshipApplication"
  ALTER COLUMN "titleOneStatus" SET DEFAULT false,
  ALTER COLUMN "enrollmentCount" SET DEFAULT 0,
  ADD COLUMN "scholarshipQualifications" TEXT[] NOT NULL DEFAULT '{}';
