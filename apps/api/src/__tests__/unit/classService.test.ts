import { checkClassAvailability } from "../../services/classService";
import { prisma } from "../../db";
import { AppError } from "../../middleware/errorHandler";
import { ErrorCode } from "@tidebook/shared";

jest.mock("../../db", () => ({
  prisma: {
    classOffering: { findUnique: jest.fn() },
    classBooking: { findMany: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockOffering = {
  id: "class-1",
  name: "Ocean Adaptations",
  durationMinutes: 60,
  capacity: 30,
  isActive: true,
};

describe("checkClassAvailability", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows a class when no other classes are booked", async () => {
    (mockPrisma.classOffering.findUnique as jest.Mock).mockResolvedValue(mockOffering);
    (mockPrisma.classBooking.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      checkClassAvailability("class-1", "2026-03-01", "09:00")
    ).resolves.not.toThrow();
  });

  it("rejects when max concurrent classes exceeded", async () => {
    (mockPrisma.classOffering.findUnique as jest.Mock).mockResolvedValue(mockOffering);
    (mockPrisma.classBooking.findMany as jest.Mock).mockResolvedValue([
      { classOfferingId: "class-2", sessionSlot: "09:00", classOffering: { durationMinutes: 60 } },
      { classOfferingId: "class-3", sessionSlot: "09:00", classOffering: { durationMinutes: 60 } },
    ]);

    await expect(
      checkClassAvailability("class-1", "2026-03-01", "09:00")
    ).rejects.toMatchObject({
      code: ErrorCode.CLASS_SLOT_UNAVAILABLE,
    });
  });

  it("rejects when gap requirement not met for same offering", async () => {
    (mockPrisma.classOffering.findUnique as jest.Mock).mockResolvedValue(mockOffering);
    // Same offering ends at 10:00, new one would start at 10:30 — only 30 min gap, need 45
    (mockPrisma.classBooking.findMany as jest.Mock).mockResolvedValue([
      {
        classOfferingId: "class-1",
        sessionSlot: "09:00",
        classOffering: { durationMinutes: 60 },
      },
    ]);

    await expect(
      checkClassAvailability("class-1", "2026-03-01", "10:30")
    ).rejects.toMatchObject({
      code: ErrorCode.CLASS_SLOT_UNAVAILABLE,
    });
  });

  it("allows same offering when gap is sufficient (45+ min)", async () => {
    (mockPrisma.classOffering.findUnique as jest.Mock).mockResolvedValue(mockOffering);
    // Existing: 09:00–10:00, new: 10:45 — 45 min gap exactly
    (mockPrisma.classBooking.findMany as jest.Mock).mockResolvedValue([
      {
        classOfferingId: "class-1",
        sessionSlot: "09:00",
        classOffering: { durationMinutes: 60 },
      },
    ]);

    await expect(
      checkClassAvailability("class-1", "2026-03-01", "10:45")
    ).resolves.not.toThrow();
  });

  it("rejects inactive class offering", async () => {
    (mockPrisma.classOffering.findUnique as jest.Mock).mockResolvedValue({
      ...mockOffering,
      isActive: false,
    });

    await expect(
      checkClassAvailability("class-1", "2026-03-01", "09:00")
    ).rejects.toMatchObject({
      code: ErrorCode.CLASS_NOT_FOUND,
    });
  });
});
