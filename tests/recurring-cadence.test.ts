import { describe, expect, it } from "vitest";

import {
  addUtcDays,
  advanceRunDate,
  asFrequency,
  FREQUENCIES,
  frequencyLabel,
  isDue,
  scheduleState,
  startOfUtcDay,
} from "@/components/recurring/meta";

/**
 * components/recurring/meta.ts — the cadence arithmetic behind recurring
 * billing, shared by the server actions and by lib/jobs/recurring.ts.
 *
 * THE RULE THAT MATTERS: the next run date is computed from the SCHEDULED date,
 * never from `Date.now()`. A schedule that ran four days late must still bill on
 * the 1st next month. If it advanced from "now", a shop with a flaky cron would
 * watch its billing day walk forward a few days every month until a customer
 * noticed they had been charged twice in one calendar month, or not at all.
 */

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe("startOfUtcDay", () => {
  it("normalises to UTC midnight so a due date reads the same everywhere", () => {
    expect(startOfUtcDay(new Date("2026-03-15T23:59:59.999Z")).toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
    expect(startOfUtcDay(new Date("2026-03-15T00:00:00.000Z")).toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
  });

  it("is idempotent", () => {
    const once = startOfUtcDay(new Date("2026-03-15T13:45:00Z"));
    expect(startOfUtcDay(once).getTime()).toBe(once.getTime());
  });

  it("does not mutate its argument", () => {
    const source = new Date("2026-03-15T13:45:00Z");
    startOfUtcDay(source);
    expect(source.toISOString()).toBe("2026-03-15T13:45:00.000Z");
  });
});

describe("addUtcDays", () => {
  it("adds whole days in UTC", () => {
    expect(iso(addUtcDays(utc(2026, 3, 15), 30))).toBe("2026-04-14");
    expect(iso(addUtcDays(utc(2026, 3, 15), 0))).toBe("2026-03-15");
    expect(iso(addUtcDays(utc(2026, 3, 15), -15))).toBe("2026-02-28");
  });

  it("crosses a US daylight-saving boundary without losing an hour", () => {
    // 8 March 2026 is a DST switch in North America. UTC arithmetic must not
    // notice, or a "net 30" invoice would fall due a day early twice a year.
    const due = addUtcDays(utc(2026, 3, 1), 30);
    expect(due.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("crosses a leap day", () => {
    expect(iso(addUtcDays(utc(2028, 2, 28), 1))).toBe("2028-02-29");
    expect(iso(addUtcDays(utc(2026, 2, 28), 1))).toBe("2026-03-01");
  });

  it("does not mutate its argument", () => {
    const source = utc(2026, 3, 15);
    addUtcDays(source, 10);
    expect(iso(source)).toBe("2026-03-15");
  });
});

describe("advanceRunDate", () => {
  it("advances a weekly schedule by exactly seven days", () => {
    expect(iso(advanceRunDate(utc(2026, 3, 15), "WEEKLY"))).toBe("2026-03-22");
  });

  it("advances monthly, quarterly and yearly by whole calendar periods", () => {
    expect(iso(advanceRunDate(utc(2026, 3, 15), "MONTHLY"))).toBe("2026-04-15");
    expect(iso(advanceRunDate(utc(2026, 3, 15), "QUARTERLY"))).toBe("2026-06-15");
    expect(iso(advanceRunDate(utc(2026, 3, 15), "YEARLY"))).toBe("2027-03-15");
  });

  it("rolls over a year boundary", () => {
    expect(iso(advanceRunDate(utc(2026, 12, 15), "MONTHLY"))).toBe("2027-01-15");
    expect(iso(advanceRunDate(utc(2026, 11, 15), "QUARTERLY"))).toBe("2027-02-15");
  });

  it("clamps to the last day of a short month instead of overflowing it", () => {
    // The failure this guards against is `setUTCMonth` on the 31st rolling
    // into 3 March.
    expect(iso(advanceRunDate(utc(2026, 1, 31), "MONTHLY"))).toBe("2026-02-28");
    expect(iso(advanceRunDate(utc(2028, 1, 31), "MONTHLY"))).toBe("2028-02-29");
    expect(iso(advanceRunDate(utc(2026, 3, 31), "MONTHLY"))).toBe("2026-04-30");
    expect(iso(advanceRunDate(utc(2026, 11, 30), "QUARTERLY"))).toBe("2027-02-28");
    expect(iso(advanceRunDate(utc(2028, 2, 29), "YEARLY"))).toBe("2029-02-28");
  });

  it("normalises the time component, whatever the stored row carried", () => {
    const messy = new Date("2026-03-15T18:22:07.451Z");
    expect(advanceRunDate(messy, "MONTHLY").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
    expect(advanceRunDate(messy, "WEEKLY").toISOString()).toBe(
      "2026-03-22T00:00:00.000Z",
    );
  });

  it("never returns a date at or before the one it was given", () => {
    for (const frequency of FREQUENCIES) {
      for (let day = 1; day <= 31; day += 1) {
        for (let month = 1; month <= 12; month += 1) {
          const from = new Date(Date.UTC(2026, month - 1, day));
          // Skip the JS overflow dates (e.g. "31 February" becomes 3 March).
          if (from.getUTCDate() !== day) continue;
          expect(advanceRunDate(from, frequency).getTime()).toBeGreaterThan(
            startOfUtcDay(from).getTime(),
          );
        }
      }
    }
  });

  it("does not mutate its argument", () => {
    const source = utc(2026, 1, 31);
    advanceRunDate(source, "MONTHLY");
    expect(iso(source)).toBe("2026-01-31");
  });
});

describe("the cadence cannot drift", () => {
  it("bills on the same calendar day however late the job actually ran", () => {
    const scheduled = utc(2026, 3, 1);

    // The job ticks four days late; the cadence is anchored to the SCHEDULED
    // date, so the next run is still the 1st.
    expect(iso(advanceRunDate(scheduled, "MONTHLY"))).toBe("2026-04-01");

    // If it advanced from "now" instead — the bug this rule exists to prevent —
    // every future invoice would slide by the length of the delay.
    const ranAt = utc(2026, 3, 5);
    expect(iso(advanceRunDate(ranAt, "MONTHLY"))).toBe("2026-04-05");
  });

  it("stays on the same day of the month across a full year", () => {
    let date = utc(2026, 1, 15);
    const days: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      date = advanceRunDate(date, "MONTHLY");
      days.push(date.getUTCDate());
    }
    expect(new Set(days)).toEqual(new Set([15]));
  });

  it("catches up one period per pass, and converges", () => {
    // A schedule three months overdue advances one period per pass rather than
    // jumping to today, so the invoices nobody raised still get raised.
    const now = utc(2026, 4, 10).getTime();
    let date = utc(2026, 1, 1);
    const raised: string[] = [];

    while (date.getTime() <= now) {
      raised.push(iso(date));
      date = advanceRunDate(date, "MONTHLY");
      expect(raised.length).toBeLessThan(10); // it must terminate
    }

    expect(raised).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]);
    expect(iso(date)).toBe("2026-05-01");
  });

  it("weekly stays on the same weekday forever", () => {
    let date = utc(2026, 1, 5); // a Monday
    const weekday = date.getUTCDay();
    for (let i = 0; i < 60; i += 1) {
      date = advanceRunDate(date, "WEEKLY");
      expect(date.getUTCDay()).toBe(weekday);
    }
  });
});

describe("asFrequency", () => {
  it("passes the four real frequencies through", () => {
    for (const frequency of FREQUENCIES) {
      expect(asFrequency(frequency)).toBe(frequency);
    }
  });

  it("falls back to MONTHLY for anything else", () => {
    for (const junk of [null, undefined, "", "DAILY", "monthly", 7, {}]) {
      expect(asFrequency(junk)).toBe("MONTHLY");
    }
  });

  it("gives every frequency a label", () => {
    for (const frequency of FREQUENCIES) {
      expect(frequencyLabel(frequency)).toBeTruthy();
    }
    expect(frequencyLabel("nonsense")).toBe("Monthly");
  });
});

describe("isDue", () => {
  const now = utc(2026, 3, 15).getTime();

  it("is due once the run date has arrived", () => {
    expect(isDue(utc(2026, 3, 15), true, now)).toBe(true);
    expect(isDue(utc(2026, 3, 14), true, now)).toBe(true);
    expect(isDue(utc(2026, 3, 16), true, now)).toBe(false);
  });

  it("is never due while the schedule is paused", () => {
    expect(isDue(utc(2020, 1, 1), false, now)).toBe(false);
  });

  it("accepts an ISO string, which is what a serialised row carries", () => {
    expect(isDue("2026-03-14T00:00:00.000Z", true, now)).toBe(true);
  });

  it("is not due on an unparseable date rather than throwing", () => {
    expect(isDue("not a date", true, now)).toBe(false);
  });
});

describe("scheduleState", () => {
  it("maps active/due onto the three badge states", () => {
    expect(scheduleState(true, true)).toBe("due");
    expect(scheduleState(true, false)).toBe("active");
    expect(scheduleState(false, true)).toBe("paused");
    expect(scheduleState(false, false)).toBe("paused");
  });
});

/**
 * DEFECT — a month-end schedule loses its anchor permanently.
 *
 * `advanceRunDate` re-derives the anchor day from the date it is HANDED, and
 * the date it is handed is the previous run's already-clamped result. So a
 * schedule anchored on the 31st clamps to 28 February — correctly — and then
 * carries 28 forward for the rest of its life:
 *
 *     2026-01-31 -> 2026-02-28 -> 2026-03-28 -> 2026-04-28 -> ...
 *
 * A shop that set a contract to bill on the last day of the month gets billed
 * on the 28th from February onwards, three days early, every month, forever.
 * The same decay hits the 29th and 30th, and quarterly/yearly schedules that
 * land on a February.
 *
 * FIXED by storing the original anchor day on the schedule
 * (RecurringInvoice.anchorDay) and clamping against that each period rather
 * than against the previous result, so a short month is a one-month adjustment
 * instead of a permanent move. Callers with no stored anchor still self-anchor
 * on the date they pass, which is correct for a single-step preview.
 */
describe("month-end anchoring", () => {
  it("clamps correctly on the FIRST advance", () => {
    expect(iso(advanceRunDate(utc(2026, 1, 31), "MONTHLY", 31))).toBe(
      "2026-02-28",
    );
  });

  it("returns to the 31st in March — February was an adjustment, not a move", () => {
    const february = advanceRunDate(utc(2026, 1, 31), "MONTHLY", 31);
    expect(iso(advanceRunDate(february, "MONTHLY", 31))).toBe("2026-03-31");
  });

  it("holds a month-end anchor for a full year", () => {
    let date = utc(2026, 1, 31);
    const run: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      date = advanceRunDate(date, "MONTHLY", 31);
      run.push(iso(date));
    }

    expect(run).toEqual([
      "2026-02-28", // clamped for February only
      "2026-03-31",
      "2026-04-30", // clamped for April only
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("holds a 30th anchor through February too", () => {
    let date = utc(2026, 1, 30);
    const run: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      date = advanceRunDate(date, "MONTHLY", 30);
      run.push(iso(date));
    }
    expect(run).toEqual(["2026-02-28", "2026-03-30", "2026-04-30"]);
  });

  it("brings a yearly 29 February schedule back on the next leap year", () => {
    let date = advanceRunDate(utc(2028, 2, 29), "YEARLY", 29); // -> 2029-02-28
    expect(iso(date)).toBe("2029-02-28");
    for (let i = 0; i < 3; i += 1) date = advanceRunDate(date, "YEARLY", 29);
    expect(iso(date)).toBe("2032-02-29");
  });

  it("still self-anchors when no anchor is supplied, for a one-step preview", () => {
    // The old behaviour, kept deliberately: a caller asking "what comes after
    // this date?" with no stored schedule has nothing else to anchor on, and
    // one step forward never decays.
    expect(iso(advanceRunDate(utc(2026, 1, 31), "MONTHLY"))).toBe("2026-02-28");
    expect(iso(advanceRunDate(utc(2026, 3, 15), "MONTHLY"))).toBe("2026-04-15");
  });

  it("ignores an out-of-range or non-integer stored anchor", () => {
    for (const bad of [0, 32, -1, 3.5, Number.NaN]) {
      expect(iso(advanceRunDate(utc(2026, 3, 15), "MONTHLY", bad))).toBe(
        "2026-04-15",
      );
    }
    expect(iso(advanceRunDate(utc(2026, 3, 15), "MONTHLY", null))).toBe(
      "2026-04-15",
    );
  });
});
