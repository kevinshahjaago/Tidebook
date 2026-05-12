import { addDays, parseISO, format, isAfter, isBefore } from "date-fns";

export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

export function addDaysToDate(dateStr: string, days: number): string {
  return formatDate(addDays(parseISO(dateStr), days));
}

export function isDateInPast(dateStr: string): boolean {
  return isBefore(parseISO(dateStr), new Date());
}

export function isDateAfter(dateStr: string, referenceStr: string): boolean {
  return isAfter(parseISO(dateStr), parseISO(referenceStr));
}

export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(
    (parseISO(to).getTime() - parseISO(from).getTime()) / msPerDay
  );
}

export function generateTimeSlots(
  startHHMM: string,
  endHHMM: string,
  intervalMinutes: number
): string[] {
  const slots: string[] = [];
  const [startH, startM] = startHHMM.split(":").map(Number);
  const [endH, endM] = endHHMM.split(":").map(Number);
  let totalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;
  while (totalMinutes <= endTotalMinutes) {
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    totalMinutes += intervalMinutes;
  }
  return slots;
}
