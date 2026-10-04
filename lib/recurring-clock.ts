import { addDaysToKey, dayKeyIn } from "@/lib/dashboard/zone";

/** A recurring run/due calendar day, stored at UTC midnight, on the shop's calendar. */
export function recurringCalendarDate(nowMs: number, zone: string, days = 0): Date {
  return new Date(`${addDaysToKey(dayKeyIn(nowMs, zone), days)}T00:00:00.000Z`);
}
