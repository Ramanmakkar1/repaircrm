import { describe, expect, it } from "vitest";

import {
  formatInZone,
  parseZonedDateInput,
  resolveZone,
  sameZonedYear,
  shortDateIn,
  wallClockIn,
  zonedCalendarDays,
  zonedToday,
} from "@/lib/shop-time";
import { dueDateLabel, dueTodayRange } from "@/lib/sla";
import { dueWords, repairChips } from "@/components/tickets/repair-card-facts";
import { readySince } from "@/components/tickets/pickup-card-facts";
import { customerFacts } from "@/components/customers/customer-facts";
import { customerSummary, shortDate } from "@/components/customers/customer-screen";
import { deleteBlockedReason, formatDate, formatDateTime } from "@/components/customers/format";

/**
 * Every day boundary and date the Repairs and Customers screens compute on the
 * server is read in the SHOP's time zone (Shop.timezone), never the server's.
 *
 * The live server runs in UTC and the shops are in Edmonton (UTC-6 in October,
 * UTC-7 from November 1). The instants below are chosen in the evening in
 * Edmonton, when UTC is already on the next calendar day: exactly where the old
 * `endOfDay(new Date())` and `format(date, "MMM d")` went wrong.
 */

const EDMONTON = "America/Edmonton";
/** Sunday Oct 4 2026, 7:30 PM in Edmonton = Monday Oct 5, 01:30 UTC. */
const EVENING = Date.UTC(2026, 9, 5, 1, 30);

describe("formatInZone", () => {
  it("prints the shop's wall clock, whatever zone the server runs in", () => {
    expect(formatInZone(EVENING, "MMM d, yyyy h:mm a", EDMONTON)).toBe("Oct 4, 2026 7:30 PM");
    expect(formatInZone(EVENING, "MMM d, yyyy h:mm a", "UTC")).toBe("Oct 5, 2026 1:30 AM");
    expect(formatInZone(new Date(EVENING), "EEEE d MMMM yyyy, h:mm a", EDMONTON)).toBe("Sunday 4 October 2026, 7:30 PM");
    expect(formatInZone(EVENING, "yyyy-MM-dd", EDMONTON)).toBe("2026-10-04");
    expect(formatInZone(EVENING, "EEE M/d HH:mm hh", EDMONTON)).toBe("Sun 10/4 19:30 07");
  });

  it("reads midnight and noon as 12 AM and 12 PM, and keeps quoted words", () => {
    expect(formatInZone(Date.UTC(2026, 9, 4, 6, 0), "h:mm a", EDMONTON)).toBe("12:00 AM");
    expect(formatInZone(Date.UTC(2026, 9, 4, 18, 5), "h:mm a 'at the shop'", EDMONTON)).toBe("12:05 PM at the shop");
  });

  it("gives nothing for an invalid date instead of throwing", () => {
    expect(formatInZone(new Date("nope"), "MMM d", EDMONTON)).toBe("");
  });

  it("uses the runtime's own zone when no zone is given (what date-fns did), and UTC for a zone Intl does not know", () => {
    expect(resolveZone(undefined)).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(resolveZone("Not/AZone")).toBe("UTC");
    const local = new Date(2026, 9, 4, 19, 30);
    expect(formatInZone(local, "MMM d h:mm a", null)).toBe("Oct 4 7:30 PM");
  });

  it("reads the weekday and the date across the November clock change", () => {
    // 1:30 AM MDT, then 1:30 AM MST an hour later: the same wall date, two instants.
    expect(wallClockIn(Date.UTC(2025, 10, 2, 7, 30), EDMONTON)).toMatchObject({ month: 11, day: 2, hour: 1, weekday: 0 });
    expect(wallClockIn(Date.UTC(2025, 10, 2, 8, 30), EDMONTON)).toMatchObject({ month: 11, day: 2, hour: 1, weekday: 0 });
  });
});

describe("today and calendar days on the shop's wall", () => {
  it("cuts today at midnight in the shop's zone", () => {
    expect(zonedToday(EVENING, EDMONTON)).toEqual({
      key: "2026-10-04",
      from: Date.UTC(2026, 9, 4, 6, 0),
      toExclusive: Date.UTC(2026, 9, 5, 6, 0),
    });
  });

  it("counts a job finished at 11pm last night as yesterday at 8am", () => {
    const lateLastNight = Date.UTC(2026, 9, 4, 5, 0); // Oct 3, 11 PM in Edmonton
    const thisMorning = Date.UTC(2026, 9, 4, 14, 0); // Oct 4, 8 AM in Edmonton
    expect(zonedCalendarDays(lateLastNight, thisMorning, EDMONTON)).toBe(1);
    // The server's UTC calendar calls both Oct 4.
    expect(zonedCalendarDays(lateLastNight, thisMorning, "UTC")).toBe(0);
  });

  it("dates a visit on the shop's calendar and adds the year only when it differs there", () => {
    const newYearsEveEvening = Date.UTC(2026, 0, 1, 3, 0); // Dec 31 2025, 8 PM in Edmonton
    expect(sameZonedYear(newYearsEveEvening, EVENING, EDMONTON)).toBe(false);
    expect(shortDateIn(newYearsEveEvening, EVENING, EDMONTON)).toBe("Dec 31, 2025");
    expect(shortDateIn(newYearsEveEvening, EVENING, "UTC")).toBe("Jan 1");
  });
});

describe("parseZonedDateInput: a typed day is that day in the shop", () => {
  it("starts the day at midnight in the shop's zone, either side of the clock change", () => {
    expect(parseZonedDateInput("2025-10-05", EDMONTON)?.getTime()).toBe(Date.UTC(2025, 9, 5, 6, 0));
    expect(parseZonedDateInput("2025-11-02", EDMONTON)?.getTime()).toBe(Date.UTC(2025, 10, 2, 6, 0));
    expect(parseZonedDateInput("2025-11-03", EDMONTON)?.getTime()).toBe(Date.UTC(2025, 10, 3, 7, 0));
  });

  it("reads back as the same day on every screen", () => {
    for (const day of ["2026-01-01", "2026-03-08", "2026-10-04", "2026-12-31"]) {
      const at = parseZonedDateInput(day, EDMONTON);
      expect(at && formatInZone(at, "yyyy-MM-dd", EDMONTON)).toBe(day);
    }
  });

  it("refuses anything that is not a real calendar day", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "10/05/2026", "tomorrow", ""]) {
      expect(parseZonedDateInput(bad, EDMONTON), bad).toBeNull();
    }
  });
});

describe("Repairs: Due today and the due date in words", () => {
  it("ends Due today at the shop's midnight, not the server's", () => {
    expect(dueTodayRange(EVENING, EDMONTON)).toEqual({
      gte: new Date(EVENING),
      lt: new Date(Date.UTC(2026, 9, 5, 6, 0)),
    });
    // What the UTC server's endOfDay said: a window running on to 6 PM tomorrow in Edmonton.
    expect(dueTodayRange(EVENING, "UTC").lt).toEqual(new Date(Date.UTC(2026, 9, 6, 0, 0)));
  });

  it("names the shop's calendar day in 'Due Oct 8'", () => {
    const dueEvening = new Date(Date.UTC(2026, 9, 9, 3, 0)); // Oct 8, 9 PM in Edmonton
    const morning = Date.UTC(2026, 9, 4, 14, 0);
    expect(dueDateLabel(dueEvening, EDMONTON)).toBe("Due Oct 8");
    expect(dueWords(dueEvening, false, morning, EDMONTON)).toEqual({ label: "Due Oct 8", alert: false });
    expect(dueWords(dueEvening, false, morning, "UTC")).toEqual({ label: "Due Oct 9", alert: false });
    expect(repairChips({ status: "New", dueDate: dueEvening }, morning, EDMONTON).due?.label).toBe("Due Oct 8");
  });

  it("keeps the spans (Overdue 2d, Due in 5h) zone-free", () => {
    const now = Date.UTC(2026, 9, 4, 14, 0);
    expect(dueWords(new Date(now - 2 * 86_400_000), false, now, EDMONTON)).toEqual({ label: "Overdue 2d", alert: true });
    expect(dueWords(new Date(now + 5 * 3_600_000), false, now, EDMONTON)).toEqual({ label: "Due in 5h", alert: false });
  });
});

describe("Pickup counter: Ready since", () => {
  it("counts days on the shop's calendar", () => {
    const lateLastNight = new Date(Date.UTC(2026, 9, 4, 5, 0));
    const thisMorning = Date.UTC(2026, 9, 4, 14, 0);
    expect(readySince(lateLastNight, thisMorning, EDMONTON)).toEqual({ label: "Ready since yesterday", long: false });
    expect(readySince(lateLastNight, thisMorning, "UTC")).toEqual({ label: "Ready today", long: false });
  });

  it("names the weekday and the date in the shop's zone", () => {
    const tuesdayNight = new Date(Date.UTC(2026, 8, 30, 4, 0)); // Tue Sep 29, 10 PM in Edmonton
    expect(readySince(tuesdayNight, EVENING, EDMONTON).label).toBe("Ready since Tuesday");
    const longAgo = new Date(Date.UTC(2026, 8, 19, 4, 0)); // Fri Sep 18, 10 PM in Edmonton
    expect(readySince(longAgo, EVENING, EDMONTON)).toEqual({ label: "Ready since Sep 18 · 16 days", long: true });
  });
});

describe("Customers: dates in the shop's zone, and plain words", () => {
  it("dates the last visit on a card on the shop's calendar", () => {
    const facts = customerFacts({
      openRepairs: 0,
      owedCents: 0,
      lastVisit: new Date(Date.UTC(2026, 8, 30, 4, 0)), // Sep 29, 10 PM in Edmonton
      now: new Date(EVENING),
      timeZone: EDMONTON,
    });
    expect(facts).toEqual([{ key: "visit", label: "Last visit Sep 29", tone: "neutral" }]);
  });

  it("dates the summary strip's last visit and 'Customer since' on the shop's calendar", () => {
    const items = customerSummary({
      openRepairs: 0,
      totalRepairs: 1,
      owedCents: 0,
      creditCents: 0,
      lastVisit: new Date(Date.UTC(2026, 8, 30, 4, 0)),
      customerSince: new Date(Date.UTC(2026, 5, 19, 3, 0)), // Jun 18, 9 PM in Edmonton
      now: new Date(EVENING),
      timeZone: EDMONTON,
    });
    const visit = items.find((item) => item.key === "visit");
    expect(visit?.value).toBe("Sep 29");
    expect(visit?.detail).toBe("Customer since Jun 18, 2026");
    expect(shortDate(new Date(Date.UTC(2026, 0, 1, 3)), new Date(EVENING), EDMONTON)).toBe("Dec 31, 2025");
  });

  it("formats table dates in the shop's zone", () => {
    expect(formatDate(new Date(EVENING), EDMONTON)).toBe("Oct 4, 2026");
    expect(formatDateTime(new Date(EVENING), EDMONTON)).toBe("Oct 4, 2026 · 7:30 PM");
    expect(formatDate(null, EDMONTON)).toBe("—");
  });

  it("says repairs, never tickets, when a customer can't be deleted", () => {
    expect(deleteBlockedReason({ tickets: 2, invoices: 1, estimates: 0 })).toBe(
      "This customer has 2 repairs and 1 invoice. Delete or reassign those records first.",
    );
  });
});
