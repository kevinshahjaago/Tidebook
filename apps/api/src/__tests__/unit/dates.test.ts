import { generateTimeSlots, addDaysToDate, daysBetween } from "../../utils/dates";

describe("generateTimeSlots", () => {
  it("generates correct slots with 30-minute intervals", () => {
    const slots = generateTimeSlots("09:00", "10:30", 30);
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("generates single slot when start equals end", () => {
    const slots = generateTimeSlots("09:00", "09:00", 30);
    expect(slots).toEqual(["09:00"]);
  });

  it("handles 15-minute intervals", () => {
    const slots = generateTimeSlots("09:00", "09:45", 15);
    expect(slots).toEqual(["09:00", "09:15", "09:30", "09:45"]);
  });
});

describe("addDaysToDate", () => {
  it("adds days correctly", () => {
    expect(addDaysToDate("2026-03-01", 14)).toBe("2026-03-15");
  });

  it("handles month boundary", () => {
    expect(addDaysToDate("2026-01-28", 5)).toBe("2026-02-02");
  });
});

describe("daysBetween", () => {
  it("calculates days between two dates", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
  });

  it("returns 0 for same date", () => {
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(0);
  });
});
