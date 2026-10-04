import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  NEEDS_YOU_LIMIT,
  averageFinish,
  benchSentence,
  buildNeedsYou,
  buildPipeline,
  buildWorkload,
  calendarDaysSince,
  compareTakings,
  countNeedsYou,
  dailyTakings,
  dayKeyIn,
  dayWords,
  finishWords,
  firstNameOf,
  greetingFor,
  hourIn,
  invoiceDaysLate,
  longDateIn,
  methodGroup,
  myQueueSentence,
  orderMoreHref,
  pipelineStatuses,
  plainMoney,
  popularProblems,
  rankNeedsYou,
  readyRowKind,
  reportDays,
  reportsDayHref,
  safeTimeZone,
  spanWords,
  startOfZonedDay,
  stockLeftWords,
  summariseOwed,
  timeIn,
  topProducts,
  workloadWords,
  type NeedsYouRow,
  type OwedInvoice,
} from "@/lib/dashboard/logic";

/**
 * The rules behind /dashboard, with no database and no React: what the page says
 * in words, how a day is cut, what ranks first and what is left out.
 *
 * "Now" is Saturday 3 October 2026, 15:00 UTC (9:00 in Edmonton). A day is the
 * shop's own calendar day in its time zone; for UTC it is the UTC day, which is
 * also how components/reports/period.ts cuts its days.
 */

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 3, 15, 0, 0);
const TODAY = Date.UTC(2026, 9, 3);

describe("money in a sentence", () => {
  it("drops the cents on whole dollars and keeps them otherwise", () => {
    expect(plainMoney(4000)).toBe("$40");
    expect(plainMoney(4050)).toBe("$40.50");
    expect(plainMoney(0)).toBe("$0");
    expect(plainMoney(1_234_500)).toBe("$12,345");
  });
});

describe("days are the shop's own days", () => {
  it("lists the last N days oldest first with today last", () => {
    const days = reportDays(NOW, "UTC", 7);
    expect(days.map((day) => day.key)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(days.map((day) => day.initial).join("")).toBe("SMTWTFS");
    expect(days.filter((day) => day.isToday).map((day) => day.key)).toEqual(["2026-10-03"]);
    const last = days[6];
    expect(last.weekday).toBe("Saturday");
    expect(last.label).toBe("Saturday, Oct 3");
    expect(last.from).toBe(TODAY);
    expect(last.toExclusive).toBe(TODAY + DAY_MS);
    expect(days[0].dayOfMonth).toBe(27);
  });

  it("builds a one-day window", () => {
    expect(reportDays(NOW, "UTC", 1)).toHaveLength(1);
    expect(reportDays(NOW, "UTC", 1)[0].isToday).toBe(true);
  });

  it("cuts days at the shop's midnight, not at UTC midnight", () => {
    // Edmonton is 6 hours behind UTC in October: its Saturday runs 06:00Z to 06:00Z.
    const [today] = reportDays(NOW, "America/Edmonton", 1);
    expect(today).toMatchObject({ key: "2026-10-03", from: Date.UTC(2026, 9, 3, 6), toExclusive: Date.UTC(2026, 9, 4, 6), label: "Saturday, Oct 3" });
  });

  it("is still the shop's Saturday at 9pm, when UTC has already turned to Sunday", () => {
    // 21:10 on Saturday 3 October in Edmonton is 03:10 on Sunday 4 October UTC: the page this was found on.
    const evening = Date.UTC(2026, 9, 4, 3, 10);
    expect(longDateIn(evening, "America/Edmonton")).toBe("Saturday, October 3");
    const days = reportDays(evening, "America/Edmonton", 7);
    expect(days[6]).toMatchObject({ key: "2026-10-03", isToday: true, weekday: "Saturday", label: "Saturday, Oct 3" });
    expect(days.map((day) => day.key)).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
    // A sale rung at 9pm is Saturday's, and the first instant of Sunday is not.
    const saturday = days[6];
    expect(evening >= saturday.from && evening < saturday.toExclusive).toBe(true);
    expect(Date.UTC(2026, 9, 4, 6, 0) >= saturday.toExclusive).toBe(true);
  });

  it("is already Sunday at 9am in a zone ahead of UTC, where UTC still says Saturday", () => {
    const morning = Date.UTC(2026, 9, 3, 20, 0); // 09:00 Sunday in Auckland (NZDT, UTC+13)
    const [today] = reportDays(morning, "Pacific/Auckland", 1);
    expect(today).toMatchObject({ key: "2026-10-04", weekday: "Sunday", from: Date.UTC(2026, 9, 3, 11), toExclusive: Date.UTC(2026, 9, 4, 11) });
  });

  it("handles half-hour and far-ahead zones", () => {
    expect(startOfZonedDay(2026, 10, 3, "Asia/Kolkata")).toBe(Date.UTC(2026, 9, 2, 18, 30));
    expect(startOfZonedDay(2026, 10, 3, "Pacific/Kiritimati")).toBe(Date.UTC(2026, 9, 2, 10));
    expect(startOfZonedDay(2026, 10, 3, "UTC")).toBe(TODAY);
  });

  it("keeps a day with a clock change 23 or 25 hours long, and steps by date", () => {
    // Chicago springs forward on Sunday 8 March 2026 and falls back on Sunday 1 November 2026.
    const spring = reportDays(Date.UTC(2026, 2, 8, 18), "America/Chicago", 3);
    expect(spring.map((day) => day.key)).toEqual(["2026-03-06", "2026-03-07", "2026-03-08"]);
    expect(spring[1].toExclusive - spring[1].from).toBe(DAY_MS);
    expect(spring[2].toExclusive - spring[2].from).toBe(23 * HOUR);
    expect(spring[2].from).toBe(Date.UTC(2026, 2, 8, 6));
    const fall = reportDays(Date.UTC(2026, 10, 1, 18), "America/Chicago", 2);
    expect(fall.map((day) => day.key)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(fall[1].toExclusive - fall[1].from).toBe(25 * HOUR);
    expect(fall[1].from).toBe(Date.UTC(2026, 10, 1, 5));
    // The days tile the timeline: each one ends where the next begins.
    for (const days of [spring, fall]) days.slice(1).forEach((day, index) => expect(day.from).toBe(days[index].toExclusive));
  });

  it("starts a day whose midnight does not exist at its first minute", () => {
    // Sao Paulo moved its clocks from 00:00 straight to 01:00 on 4 November 2018 (UTC-3 to UTC-2).
    expect(startOfZonedDay(2018, 11, 4, "America/Sao_Paulo")).toBe(Date.UTC(2018, 10, 4, 3));
    expect(startOfZonedDay(2018, 11, 3, "America/Sao_Paulo")).toBe(Date.UTC(2018, 10, 3, 3));
  });

  it("names the day of an instant on the shop's wall calendar", () => {
    expect(dayKeyIn(Date.UTC(2026, 9, 4, 3, 10), "America/Edmonton")).toBe("2026-10-03");
    expect(dayKeyIn(Date.UTC(2026, 9, 4, 3, 10), "UTC")).toBe("2026-10-04");
    expect(dayKeyIn(Date.UTC(2026, 9, 4, 3, 10), "Not/AZone")).toBe("2026-10-04");
  });

  it("links a day to the Reports page for that single day", () => {
    expect(reportsDayHref("2026-10-03")).toBe("/reports?period=custom&from=2026-10-03&to=2026-10-03");
  });

  it("counts whole calendar days, not 24-hour spans", () => {
    expect(calendarDaysSince(Date.UTC(2026, 9, 2, 23, 59), Date.UTC(2026, 9, 3, 0, 1))).toBe(1);
    expect(calendarDaysSince(TODAY, NOW)).toBe(0);
    expect(calendarDaysSince(NOW + DAY_MS, NOW)).toBe(-1);
  });

  it("says a span in plain words", () => {
    expect(spanWords(10 * 60_000)).toBe("a few minutes");
    expect(spanWords(HOUR)).toBe("1 hour");
    expect(spanWords(3 * HOUR)).toBe("3 hours");
    expect(spanWords(DAY_MS)).toBe("1 day");
    expect(spanWords(49 * HOUR)).toBe("2 days");
    expect(spanWords(-5)).toBe("a few minutes");
  });
});

describe("time of day and the shop's own zone", () => {
  it("greets by the hour", () => {
    expect(greetingFor(0)).toBe("Hello");
    expect(greetingFor(4)).toBe("Hello");
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(16)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });

  it("reads the hour and the date in the shop's zone", () => {
    expect(hourIn(NOW, "UTC")).toBe(15);
    expect(hourIn(NOW, "America/Edmonton")).toBe(9);
    expect(longDateIn(NOW, "UTC")).toBe("Saturday, October 3");
    // Already Sunday morning in Auckland while it is still Saturday afternoon in UTC.
    expect(longDateIn(NOW, "Pacific/Auckland")).toBe("Sunday, October 4");
  });

  it("falls back to UTC for a zone Intl does not know, and never throws", () => {
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(safeTimeZone("America/Edmonton")).toBe("America/Edmonton");
    expect(hourIn(NOW, "Not/AZone")).toBe(15);
    expect(longDateIn(NOW, "")).toBe("Saturday, October 3");
  });

  it("names a visit's day and time", () => {
    expect(dayWords(NOW + 2 * HOUR, NOW, "UTC")).toBe("Today");
    expect(dayWords(NOW + DAY_MS, NOW, "UTC")).toBe("Tomorrow");
    expect(dayWords(NOW + 3 * DAY_MS, NOW, "UTC")).toBe("Tue, Oct 6");
    expect(timeIn(Date.UTC(2026, 9, 3, 20, 30), "UTC")).toMatch(/^8:30\sPM$/);
  });

  it("measures today and tomorrow on the shop's calendar, in the evening and across a clock change", () => {
    // 21:10 Saturday in Edmonton: a visit at 10am Sunday there is tomorrow, though UTC calls both Sunday.
    const evening = Date.UTC(2026, 9, 4, 3, 10);
    expect(dayWords(evening + 2 * HOUR, evening, "America/Edmonton")).toBe("Today");
    expect(dayWords(Date.UTC(2026, 9, 4, 16), evening, "America/Edmonton")).toBe("Tomorrow");
    // The Chicago day of 1 November has 25 hours: 00:30 plus 24 hours is still that day, so "tomorrow" cannot be now + 24h.
    const earlyHours = Date.UTC(2026, 10, 1, 5, 30);
    expect(dayWords(Date.UTC(2026, 10, 2, 16), earlyHours, "America/Chicago")).toBe("Tomorrow");
  });

  it("takes the first word of a name", () => {
    expect(firstNameOf("Dana Ortiz")).toBe("Dana");
    expect(firstNameOf("  Dana  ")).toBe("Dana");
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf(null)).toBe("");
  });
});

describe("takings by day", () => {
  const days = reportDays(NOW, "UTC", 3); // Oct 1, 2, 3

  it("fills every day, keeps empty days at zero and splits cash, card and other", () => {
    const rows = dailyTakings(
      days,
      [
        { amountCents: 1000, method: "CASH", createdAt: Date.UTC(2026, 9, 3, 10) },
        { amountCents: 2500, method: "CARD", createdAt: Date.UTC(2026, 9, 3, 11) },
        { amountCents: 500, method: "CHECK", createdAt: Date.UTC(2026, 9, 1, 12) },
        { amountCents: 100, method: "CREDIT", createdAt: Date.UTC(2026, 9, 1, 13) },
      ],
      [],
    );
    expect(rows.map((row) => row.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(rows[0]).toMatchObject({ grossCents: 600, otherCents: 600, cashCents: 0, cardCents: 0, netCents: 600 });
    expect(rows[1]).toEqual({ key: "2026-10-02", grossCents: 0, refundCents: 0, netCents: 0, cashCents: 0, cardCents: 0, otherCents: 0 });
    expect(rows[2]).toMatchObject({ grossCents: 3500, cashCents: 1000, cardCents: 2500, otherCents: 0, netCents: 3500 });
  });

  it("subtracts refunds on the day they were handed back (Reports' net revenue)", () => {
    const rows = dailyTakings(
      days,
      [{ amountCents: 10_000, method: "CARD", createdAt: Date.UTC(2026, 9, 3, 9) }],
      [
        { amountCents: 3000, createdAt: Date.UTC(2026, 9, 3, 16) },
        { amountCents: 300, createdAt: Date.UTC(2026, 9, 2, 8) },
      ],
    );
    expect(rows[2]).toMatchObject({ grossCents: 10_000, refundCents: 3000, netCents: 7000 });
    // A refund on a day with no sales makes that day negative: it is real money that went out.
    expect(rows[1]).toMatchObject({ grossCents: 0, refundCents: 300, netCents: -300 });
  });

  it("includes UTC midnight at the start of a day and leaves out the next midnight", () => {
    const rows = dailyTakings(
      days,
      [
        { amountCents: 100, method: "CASH", createdAt: TODAY },
        { amountCents: 900, method: "CASH", createdAt: TODAY + DAY_MS },
        { amountCents: 700, method: "CASH", createdAt: Date.UTC(2026, 8, 30, 23, 59, 59, 999) },
      ],
      [],
    );
    expect(rows[2].grossCents).toBe(100);
    expect(rows.reduce((sum, row) => sum + row.grossCents, 0)).toBe(100);
  });

  it("groups payment methods", () => {
    expect(methodGroup("CASH")).toBe("cash");
    expect(methodGroup("CARD")).toBe("card");
    expect(methodGroup("CHECK")).toBe("other");
    expect(methodGroup("CREDIT")).toBe("other");
    expect(methodGroup("")).toBe("other");
  });
});

describe("takings compared in plain words", () => {
  const base = { todayNetCents: 0, todayGrossCents: 0, yesterdayNetCents: 0, lastWeekNetCents: 0, earlierNetCents: 0, weekday: "Saturday" };

  it("says nothing was taken when there are no payments and no refunds", () => {
    expect(compareTakings(base)).toEqual({ kind: "none", text: "Nothing taken yet today", deltaCents: 0 });
  });

  it("says first sale when nothing was taken in the days before", () => {
    expect(compareTakings({ ...base, todayNetCents: 4000, todayGrossCents: 4000 })).toEqual({ kind: "first", text: "First sale today", deltaCents: 4000 });
  });

  it("compares with yesterday, more or less, in whole dollars", () => {
    const more = compareTakings({ ...base, todayNetCents: 10_000, todayGrossCents: 10_000, yesterdayNetCents: 6000 });
    expect(more).toEqual({ kind: "up", text: "$40 more than yesterday", deltaCents: 4000 });
    const less = compareTakings({ ...base, todayNetCents: 6000, todayGrossCents: 6000, yesterdayNetCents: 10_000 });
    expect(less).toEqual({ kind: "down", text: "$40 less than yesterday", deltaCents: -4000 });
  });

  it("keeps the cents when the difference is not whole dollars", () => {
    expect(compareTakings({ ...base, todayNetCents: 10_050, todayGrossCents: 10_050, yesterdayNetCents: 6000 }).text).toBe("$40.50 more than yesterday");
  });

  it("uses the same weekday last week when yesterday took nothing (a shop closed on Sundays)", () => {
    const result = compareTakings({ ...base, todayNetCents: 3800, todayGrossCents: 3800, yesterdayNetCents: 0, lastWeekNetCents: 5000, weekday: "Monday" });
    expect(result).toEqual({ kind: "down", text: "$12 less than last Monday", deltaCents: -1200 });
  });

  it("says the same when the two days match", () => {
    expect(compareTakings({ ...base, todayNetCents: 5000, todayGrossCents: 5000, yesterdayNetCents: 5000 })).toEqual({ kind: "same", text: "Same as yesterday", deltaCents: 0 });
  });

  it("measures against zero yesterday when the rest of the week was not empty", () => {
    const result = compareTakings({ ...base, todayNetCents: 2500, todayGrossCents: 2500, earlierNetCents: 3000 });
    expect(result).toEqual({ kind: "up", text: "$25 more than yesterday", deltaCents: 2500 });
  });

  it("tells the truth when refunds cancel or exceed the takings", () => {
    expect(compareTakings({ ...base, todayNetCents: 0, todayGrossCents: 4000 }).text).toBe("Takings and refunds cancel out today");
    expect(compareTakings({ ...base, todayNetCents: -1500, todayGrossCents: 1000 })).toMatchObject({ kind: "down", text: "More refunded than taken today", deltaCents: -1500 });
  });
});

describe("the repair pipeline", () => {
  it("keeps the shop's order, leaves out Resolved and adds unknown statuses at the end", () => {
    expect(pipelineStatuses(["New", "In Progress", "Resolved", "Ready for Pickup", "New"], ["New", "Zeta", "Alpha", "Resolved"])).toEqual([
      "New",
      "In Progress",
      "Ready for Pickup",
      "Alpha",
      "Zeta",
    ]);
  });

  it("builds a tile per status with counts, late counts, a link and at most three pictures", () => {
    const device = (model: string) => ({ type: "Phone", make: "Apple", model });
    const tiles = buildPipeline({
      statuses: ["New", "In Progress"],
      counts: { New: 2 },
      overdue: { New: 1 },
      devices: { New: [device("a"), device("b"), device("c"), device("d")] },
    });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({ status: "New", count: 2, overdue: 1, href: "/tickets?status=New" });
    expect(tiles[0].devices).toHaveLength(3);
    expect(tiles[1]).toEqual({ status: "In Progress", count: 0, overdue: 0, href: "/tickets?status=In%20Progress", devices: [] });
  });

  it("writes the bench sentence in words", () => {
    expect(benchSentence(0, 0)).toBe("Nothing is on the bench.");
    expect(benchSentence(12, 9)).toBe("12 open repairs. 9 are late.");
    expect(benchSentence(1, 0)).toBe("1 open repair. None are late.");
    expect(benchSentence(1, 1)).toBe("1 open repair. It is late.");
    expect(benchSentence(3, 3)).toBe("3 open repairs. All are late.");
    expect(benchSentence(5, 1)).toBe("5 open repairs. 1 is late.");
  });

  it("writes a technician's own sentence", () => {
    expect(myQueueSentence(0, 0)).toBe("You have no open repairs.");
    expect(myQueueSentence(4, 1)).toBe("You have 4 open repairs. 1 is late.");
    expect(myQueueSentence(2, 2)).toBe("You have 2 open repairs. All are late.");
    expect(myQueueSentence(1, 0)).toBe("You have 1 open repair. None are late.");
  });
});

describe("time to finish", () => {
  it("averages intake to resolved and skips a back-dated resolve", () => {
    const summary = averageFinish([
      { createdAt: 0, resolvedAt: 2 * DAY_MS },
      { createdAt: 0, resolvedAt: 4 * DAY_MS },
      { createdAt: 10, resolvedAt: 5 },
    ]);
    expect(summary).toEqual({ count: 2, meanMs: 3 * DAY_MS });
    expect(averageFinish([])).toEqual({ count: 0, meanMs: 0 });
  });

  it("says it in days, hours or minutes", () => {
    expect(finishWords(3.2 * DAY_MS)).toBe("3.2 days");
    expect(finishWords(DAY_MS)).toBe("1 day");
    expect(finishWords(2 * DAY_MS)).toBe("2 days");
    expect(finishWords(1.04 * DAY_MS)).toBe("1 day");
    expect(finishWords(5 * HOUR)).toBe("5 hours");
    expect(finishWords(40 * 60_000)).toBe("40 minutes");
    expect(finishWords(1000)).toBe("1 minute");
  });
});

describe("who is working on what", () => {
  const users = [
    { id: "maria", name: "Maria Wong", role: "TECH", active: true },
    { id: "sam", name: "Sam Lee", role: "TECH", active: true },
    { id: "old", name: "Old Tech", role: "TECH", active: false },
    { id: "owner", name: "Dana Ortiz", role: "OWNER", active: true },
    { id: "ben", name: "Ben Ford", role: "FRONT_DESK", active: true },
  ];

  it("shows the unassigned row first, then the biggest load, with free technicians at zero", () => {
    const { rows, hidden } = buildWorkload({ users, openByUser: { maria: 5, ben: 2, "": 3 }, lateByUser: { maria: 2, "": 1 } });
    expect(hidden).toBe(0);
    expect(rows.map((row) => row.name)).toEqual(["Not assigned", "Maria Wong", "Ben Ford", "Sam Lee"]);
    expect(rows[0]).toMatchObject({ userId: null, open: 3, late: 1, href: "/tickets?tech=unassigned", words: "Not assigned: 3 open, 1 late" });
    expect(rows[1]).toMatchObject({ userId: "maria", open: 5, late: 2, href: "/tickets?tech=maria", words: "Maria Wong: 5 open, 2 late" });
    expect(rows[3].words).toBe("Sam Lee: nothing open");
  });

  it("leaves out people with nothing open unless they are active technicians", () => {
    const { rows } = buildWorkload({ users, openByUser: {}, lateByUser: {} });
    expect(rows.map((row) => row.name)).toEqual(["Maria Wong", "Sam Lee"]);
  });

  it("omits the unassigned row when every repair has an owner and caps the list", () => {
    const { rows, hidden } = buildWorkload({ users, openByUser: { maria: 5, ben: 2, sam: 1 }, lateByUser: {}, limit: 2 });
    expect(rows.map((row) => row.name)).toEqual(["Maria Wong", "Ben Ford"]);
    expect(hidden).toBe(1);
  });

  it("reads a row in words", () => {
    expect(workloadWords("Maria Wong", 5, 0)).toBe("Maria Wong: 5 open");
    expect(workloadWords("Maria Wong", 0, 0)).toBe("Maria Wong: nothing open");
  });

  it("escapes a user id in the link", () => {
    const { rows } = buildWorkload({ users: [{ id: "a b&c", name: "Odd", role: "TECH", active: true }], openByUser: { "a b&c": 1 }, lateByUser: {} });
    expect(rows[0].href).toBe("/tickets?tech=a%20b%26c");
  });
});

describe("popular repairs and top products", () => {
  it("merges problem types that differ only by case or spacing, names a blank one Other and sorts", () => {
    const rows = popularProblems([
      { problemType: "Screen", count: 3 },
      { problemType: "screen ", count: 2 },
      { problemType: "", count: 1 },
      { problemType: "Battery", count: 4 },
      { problemType: "Water", count: 0 },
    ]);
    expect(rows).toEqual([
      { label: "Screen", count: 5 },
      { label: "Battery", count: 4 },
      { label: "Other", count: 1 },
    ]);
    expect(popularProblems([{ problemType: "A", count: 1 }, { problemType: "B", count: 1 }, { problemType: "C", count: 1 }], 2)).toHaveLength(2);
    expect(popularProblems([])).toEqual([]);
  });

  it("totals revenue by product name, biggest first, like Reports' top products", () => {
    const rows = topProducts([
      { productId: "p1", name: "iPhone 14 Screen Assembly", quantity: 1, unitPriceCents: 18_900 },
      { productId: "p1", name: "iPhone 14 Screen Assembly", quantity: 2, unitPriceCents: 18_900 },
      { productId: "p2", name: "Data Recovery", quantity: 1, unitPriceCents: 17_500 },
      { productId: "p3", name: "", quantity: 1, unitPriceCents: 100 },
    ]);
    expect(rows).toEqual([
      { productId: "p1", name: "iPhone 14 Screen Assembly", units: 3, cents: 56_700 },
      { productId: "p2", name: "Data Recovery", units: 1, cents: 17_500 },
      { productId: "p3", name: "Unnamed product", units: 1, cents: 100 },
    ]);
    expect(topProducts([], 5)).toEqual([]);
    expect(topProducts(rows.map((row) => ({ productId: row.productId, name: row.name, quantity: row.units, unitPriceCents: row.cents / row.units })), 2)).toHaveLength(2);
  });
});

describe("owed to you", () => {
  const line = (cents: number) => [{ quantity: 1, unitPriceCents: cents, taxable: false }];
  const invoice = (over: Partial<OwedInvoice> & Pick<OwedInvoice, "id" | "customerId" | "customerName">): OwedInvoice => ({
    number: 1,
    callHref: null,
    dueAt: null,
    taxRateBps: 0,
    lines: line(10_000),
    payments: [],
    refunds: [],
    ...over,
  });

  it("counts days late in calendar days, never before the due day has passed", () => {
    expect(invoiceDaysLate(null, NOW)).toBe(0);
    expect(invoiceDaysLate(NOW + DAY_MS, NOW)).toBe(0);
    expect(invoiceDaysLate(TODAY, NOW)).toBe(0);
    expect(invoiceDaysLate(TODAY - DAY_MS, NOW)).toBe(1);
    expect(invoiceDaysLate(TODAY - 2 * DAY_MS, NOW)).toBe(2);
  });

  it("totals the balance of unpaid invoices the way the invoices list reads them", () => {
    const owed = summariseOwed(
      [
        invoice({ id: "a", number: 1014, customerId: "c1", customerName: "Okonkwo Dental", lines: line(45_000), dueAt: TODAY - 2 * DAY_MS, callHref: "tel:+15125550100" }),
        // Paid in full, then refunded in full: the customer owes it again.
        invoice({ id: "b", customerId: "c2", customerName: "Elena Marquez", payments: [{ amountCents: 10_000 }], refunds: [{ amountCents: 10_000, status: "completed" }] }),
        invoice({ id: "c", customerId: "c1", customerName: "Okonkwo Dental", lines: line(30_000), payments: [{ amountCents: 10_000 }], dueAt: NOW + 5 * DAY_MS }),
        // Settled: not a debt.
        invoice({ id: "d", customerId: "c3", customerName: "Settled Co", payments: [{ amountCents: 10_000 }] }),
        // A refund that failed never left the till, so the invoice stays paid.
        invoice({ id: "e", customerId: "c4", customerName: "Failed Refund", payments: [{ amountCents: 10_000 }], refunds: [{ amountCents: 10_000, status: "failed" }] }),
        // Overpaid does not cancel anyone else's debt.
        invoice({ id: "f", customerId: "c5", customerName: "Overpaid", payments: [{ amountCents: 99_999 }] }),
      ],
      NOW,
    );
    expect(owed.totalCents).toBe(45_000 + 10_000 + 20_000);
    expect(owed.count).toBe(3);
    expect(owed.overdueCount).toBe(1);
    expect(owed.customers.map((customer) => [customer.name, customer.cents, customer.invoices])).toEqual([
      ["Okonkwo Dental", 65_000, 2],
      ["Elena Marquez", 10_000, 1],
    ]);
    expect(owed.customers[0].callHref).toBe("tel:+15125550100");
    expect(owed.lateInvoices).toEqual([{ id: "a", number: 1014, customerId: "c1", customerName: "Okonkwo Dental", dueAt: TODAY - 2 * DAY_MS, daysLate: 2, balanceCents: 45_000 }]);
  });

  it("tax is part of the balance", () => {
    const owed = summariseOwed([invoice({ id: "a", customerId: "c1", customerName: "A", lines: [{ quantity: 1, unitPriceCents: 10_000, taxable: true }], taxRateBps: 825 })], NOW);
    expect(owed.totalCents).toBe(10_825);
  });

  it("keeps only the top customers and the worst late invoices", () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      invoice({ id: `i${index}`, customerId: `c${index}`, customerName: `Customer ${index}`, lines: line((index + 1) * 1000), dueAt: TODAY - (index + 1) * DAY_MS }),
    );
    const owed = summariseOwed(many, NOW, { customerLimit: 3, lateLimit: 2 });
    expect(owed.count).toBe(5);
    expect(owed.customers.map((customer) => customer.name)).toEqual(["Customer 4", "Customer 3", "Customer 2"]);
    expect(owed.lateInvoices.map((late) => late.id)).toEqual(["i4", "i3"]);
    expect(owed.overdueCount).toBe(5);
  });

  it("is empty with no invoices", () => {
    expect(summariseOwed([], NOW)).toEqual({ totalCents: 0, count: 0, overdueCount: 0, customers: [], lateInvoices: [] });
  });
});

describe("needs you now", () => {
  const device = { type: "Laptop", make: "Dell", model: "XPS 13" };
  const input = {
    now: NOW,
    showMoney: true,
    canOrder: true,
    overdueRepairs: [] as Parameters<typeof buildNeedsYou>[0]["overdueRepairs"],
    readyRepairs: [] as Parameters<typeof buildNeedsYou>[0]["readyRepairs"],
    lateInvoices: [] as Parameters<typeof buildNeedsYou>[0]["lateInvoices"],
    replies: [] as Parameters<typeof buildNeedsYou>[0]["replies"],
    lowStock: [] as Parameters<typeof buildNeedsYou>[0]["lowStock"],
  };
  const overdue = (id: string, daysLate: number, priority = "NORMAL") => ({
    id,
    number: 1,
    customer: "Amara Nwosu",
    device,
    deviceLabel: "Dell XPS 13",
    dueAt: NOW - daysLate * DAY_MS,
    priority,
  });
  const ready = (id: string, days: number, extra: Partial<Parameters<typeof buildNeedsYou>[0]["readyRepairs"][number]> = {}) => ({
    id,
    number: 2,
    customer: "Elena Marquez",
    device,
    deviceLabel: "iPhone 14 Pro",
    readySince: NOW - days * DAY_MS,
    callHref: "tel:+15125550111",
    dueCents: 0,
    invoiceId: null,
    ...extra,
  });
  const stock = (id: string, qty: number) => ({ id, name: `Part ${id}`, stockQty: qty, lowStockAt: 3, vendorId: "v1", category: null, catalogImage: null, imageUrl: null });

  it("ranks the most pressing first, one plain sentence and one button each", () => {
    const { rows, candidates } = buildNeedsYou({
      ...input,
      overdueRepairs: [overdue("o1", 3), overdue("o2", 1, "URGENT")],
      readyRepairs: [ready("r1", 2, { dueCents: 5000, invoiceId: "inv1" }), ready("r2", 5)],
      lateInvoices: [{ id: "inv9", number: 1014, customerId: "c1", customerName: "Okonkwo Dental", dueAt: NOW - 2 * DAY_MS, daysLate: 2, balanceCents: 45_000 }],
      replies: [{ id: "q1", number: 3, customer: "Sofia Kaur", device, deviceLabel: "HP Envy", since: NOW - 3 * HOUR }],
      lowStock: [stock("s1", 0), stock("s2", 2)],
    });
    expect(candidates).toBe(8);
    expect(rows).toHaveLength(NEEDS_YOU_LIMIT);
    expect(rows.map((row) => row.kind)).toEqual(["overdue-repair", "overdue-repair", "ready-unpaid", "invoice-late", "ready-waiting", "reply"]);
    expect(rows.map((row) => row.key)).toEqual(["overdue:o2", "overdue:o1", "ready-unpaid:r1", "invoice:inv9", "ready-waiting:r2", "reply:q1"]);

    expect(rows[1]).toMatchObject({ tag: "Overdue", sentence: "Dell XPS 13 for Amara Nwosu is 3 days late.", action: { label: "Open", href: "/tickets/o1" } });
    expect(rows[2]).toMatchObject({
      tag: "Unpaid",
      sentence: "Elena Marquez can collect their iPhone 14 Pro, but still owes $50.",
      action: { label: "Take payment", href: "/invoices/inv1" },
    });
    expect(rows[3]).toMatchObject({
      sentence: "Invoice #1014 for Okonkwo Dental is 2 days late: $450 owed.",
      action: { label: "Take payment", href: "/invoices/inv9" },
      visual: { kind: "person", name: "Okonkwo Dental" },
    });
    expect(rows[4]).toMatchObject({
      sentence: "iPhone 14 Pro has been ready for 5 days. Elena Marquez has not collected it.",
      action: { label: "Call", href: "tel:+15125550111", call: true },
    });
    expect(rows[5]).toMatchObject({ sentence: "Sofia Kaur is waiting for a reply about HP Envy.", action: { label: "Reply", href: "/tickets/q1" } });
    for (const row of rows) expect(row.action.label.length).toBeGreaterThan(0);
  });

  it("offers Order more for a low-stock item and says out of stock in words", () => {
    const { rows } = buildNeedsYou({ ...input, lowStock: [stock("s1", 0), stock("s2", 2)] });
    expect(rows.map((row) => row.sentence)).toEqual(["Part s1 is out of stock.", "Part s2: only 2 left (reorder at 3)."]);
    expect(rows[0].action).toEqual({ label: "Order more", href: "/inventory/purchase-orders/new?vendorId=v1" });
    expect(rows[0].visual).toMatchObject({ kind: "product", productId: "s1" });
  });

  it("keeps a ready repair that is not late, not unpaid and not waiting out of the list", () => {
    const { rows } = buildNeedsYou({ ...input, readyRepairs: [ready("r1", 1), ready("r2", 2)] });
    expect(rows).toEqual([]);
  });

  it("falls back to Open when a waiting customer has no phone", () => {
    const { rows } = buildNeedsYou({ ...input, readyRepairs: [ready("r1", 4, { callHref: null })] });
    expect(rows[0].action).toEqual({ label: "Open", href: "/tickets/r1" });
  });

  it("names a repair that is both late and ready only once, with the most pressing reason", () => {
    const { rows } = buildNeedsYou({
      ...input,
      overdueRepairs: [overdue("t9", 3)],
      readyRepairs: [ready("t9", 2, { dueCents: 5000, invoiceId: "inv1" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("overdue-repair");
  });

  it("never lets one kind fill the whole list", () => {
    const many = Array.from({ length: 5 }, (_, index) => overdue(`o${index}`, index + 1));
    const { rows, candidates } = buildNeedsYou({ ...input, overdueRepairs: many });
    expect(rows).toHaveLength(3);
    expect(candidates).toBe(5);
    // The three that are most late.
    expect(rows.map((row) => row.key)).toEqual(["overdue:o4", "overdue:o3", "overdue:o2"]);
  });

  it("still shows a customer waiting for a reply when the repair's overdue row was cut by the cap", () => {
    // Four late repairs fill the overdue quota (three rows); the fourth is also waiting for a reply.
    const four = [overdue("o1", 9), overdue("o2", 8), overdue("o3", 7), overdue("o4", 1)];
    const { rows, candidates } = buildNeedsYou({
      ...input,
      overdueRepairs: four,
      replies: [{ id: "o4", number: 1004, customer: "Daniel Brooks", device, deviceLabel: "Dell Latitude 5420", since: NOW - 2 * DAY_MS }],
    });
    expect(rows.map((row) => row.key)).toEqual(["overdue:o1", "overdue:o2", "overdue:o3", "reply:o4"]);
    // The same repair is one thing, not two.
    expect(candidates).toBe(4);
  });

  it("gives a repair that is both late and waiting for a reply one row, the overdue one, while there is room", () => {
    const { rows } = buildNeedsYou({
      ...input,
      overdueRepairs: [overdue("o1", 4)],
      replies: [{ id: "o1", number: 1, customer: "Daniel Brooks", device, deviceLabel: "Dell XPS 13", since: NOW - DAY_MS }],
    });
    expect(rows.map((row) => row.key)).toEqual(["overdue:o1"]);
  });

  it("says which kind of ready row a repair earns", () => {
    expect(readyRowKind(ready("r", 1, { dueCents: 5000 }), NOW, true)).toBe("ready-unpaid");
    expect(readyRowKind(ready("r", 1, { dueCents: 5000 }), NOW, false)).toBeNull();
    expect(readyRowKind(ready("r", 3), NOW, true)).toBe("ready-waiting");
    expect(readyRowKind(ready("r", 2), NOW, true)).toBeNull();
  });

  it("hides every money row from someone who may not see money", () => {
    const { rows } = buildNeedsYou({
      ...input,
      showMoney: false,
      canOrder: false,
      readyRepairs: [ready("r1", 2, { dueCents: null, invoiceId: null }), ready("r2", 6, { dueCents: null })],
      lateInvoices: [{ id: "inv9", number: 1, customerId: "c1", customerName: "A", dueAt: NOW - DAY_MS, daysLate: 1, balanceCents: 100 }],
      lowStock: [stock("s1", 1)],
    });
    expect(rows.map((row) => row.kind)).toEqual(["ready-waiting", "low-stock"]);
    expect(JSON.stringify(rows)).not.toMatch(/\$|owes|Take payment|invoice/i);
    // A non-owner cannot raise a purchase order, so the button opens the product instead.
    expect(rows[1].action).toEqual({ label: "Open", href: "/inventory/s1" });
  });

  it("is empty when nothing needs anyone", () => {
    expect(buildNeedsYou(input)).toEqual({ rows: [], candidates: 0 });
  });

  it("ranks by score, then key, and honours the limit", () => {
    const row = (key: string, score: number): NeedsYouRow => ({
      key,
      kind: "reply",
      tag: "Reply",
      score,
      sentence: key,
      visual: { kind: "person", name: key },
      action: { label: "Reply", href: "/" },
    });
    const ranked = rankNeedsYou([row("b", 1), row("a", 1), row("c", 5)], 2);
    expect(ranked.map((r) => r.key)).toEqual(["c", "a"]);
  });

  it("builds the order link and the stock words", () => {
    expect(orderMoreHref({ canOrder: true, productId: "p1", vendorId: "v 1" })).toBe("/inventory/purchase-orders/new?vendorId=v%201");
    expect(orderMoreHref({ canOrder: true, productId: "p1", vendorId: null })).toBe("/inventory/purchase-orders/new");
    expect(orderMoreHref({ canOrder: false, productId: "p1", vendorId: "v1" })).toBe("/inventory/p1");
    expect(stockLeftWords(0)).toBe("Out of stock");
    expect(stockLeftWords(-2)).toBe("Out of stock");
    expect(stockLeftWords(2)).toBe("2 left");
  });
});

describe("how many things need you in all", () => {
  const device = { type: "Laptop", make: "Dell", model: "XPS 13" };
  const base = { now: NOW, showMoney: true, lateRepairs: 0, replyIds: [] as string[], lateReplies: 0, readyRepairs: [] as Parameters<typeof countNeedsYou>[0]["readyRepairs"], lateInvoices: 0, lowStock: 0 };
  const ready = (id: string, days: number, extra: Record<string, unknown> = {}) => ({
    id,
    number: 2,
    customer: "Elena Marquez",
    device,
    deviceLabel: "iPhone 14 Pro",
    readySince: NOW - days * DAY_MS,
    callHref: null,
    dueCents: 0,
    invoiceId: null,
    ...extra,
  });

  it("counts every late repair, not only the few that were fetched", () => {
    // The demo shop: 9 late repairs (only 6 are read), 1 late invoice, 2 ready for pickup, 1 low-stock product,
    // and one customer waiting for a reply on a repair that is already one of the late ones.
    const total = countNeedsYou({ ...base, lateRepairs: 9, replyIds: ["t4"], lateReplies: 1, readyRepairs: [ready("r1", 10), ready("r2", 5)], lateInvoices: 1, lowStock: 1 });
    expect(total).toBe(13);
  });

  it("counts a late repair that is also waiting for a reply once", () => {
    expect(countNeedsYou({ ...base, lateRepairs: 2, replyIds: ["a", "b", "c"], lateReplies: 2 })).toBe(3);
  });

  it("counts a late ready repair once, as late", () => {
    expect(countNeedsYou({ ...base, lateRepairs: 1, readyRepairs: [ready("r1", 6, { dueAt: NOW - DAY_MS })] })).toBe(1);
    // Not yet due: it is a thing of its own.
    expect(countNeedsYou({ ...base, lateRepairs: 1, readyRepairs: [ready("r1", 6, { dueAt: NOW + DAY_MS })] })).toBe(2);
    expect(countNeedsYou({ ...base, readyRepairs: [ready("r1", 6)] })).toBe(1);
  });

  it("counts a ready repair that is also waiting for a reply once", () => {
    expect(countNeedsYou({ ...base, replyIds: ["r1"], lateReplies: 0, readyRepairs: [ready("r1", 6)] })).toBe(1);
  });

  it("leaves out a ready repair that does not earn a row, and money rows for someone who may not see money", () => {
    expect(countNeedsYou({ ...base, readyRepairs: [ready("r1", 1), ready("r2", 2)] })).toBe(0);
    expect(countNeedsYou({ ...base, showMoney: false, readyRepairs: [ready("r1", 1, { dueCents: 9000 })] })).toBe(0);
    expect(countNeedsYou({ ...base, showMoney: true, readyRepairs: [ready("r1", 1, { dueCents: 9000 })] })).toBe(1);
  });

  it("is zero when nothing needs anyone, and never negative", () => {
    expect(countNeedsYou(base)).toBe(0);
    expect(countNeedsYou({ ...base, replyIds: ["a"], lateReplies: 4 })).toBe(0);
  });
});
