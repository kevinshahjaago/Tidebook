-- AlterTable: replace single address text with structured address fields
ALTER TABLE "Booking"
  ADD COLUMN "addressStreet1" TEXT,
  ADD COLUMN "addressStreet2" TEXT,
  ADD COLUMN "addressCity"    TEXT,
  ADD COLUMN "addressState"   TEXT NOT NULL DEFAULT 'WA',
  ADD COLUMN "addressZip"     TEXT;
