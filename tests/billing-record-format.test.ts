import { describe, expect, it } from "vitest";

import {
  autoLabel,
  estimateCardLine,
  estimateMoneyLine,
  estimateTabCounts,
  invoiceCardLine,
  invoiceMoneyLine,
  invoiceTabCounts,
  invoicesSoFar,
  matchesSchedule,
  overdueLabel,
  scheduleCardLine,
  sentenceCase,
  shortDay,
} from "@/components/billing/record-format";

/**
 * The sentences on the Easy-mode Invoices, Estimates and Recurring cards.
 * "Now" is fixed at noon UTC on 3 Oct 2026 so nothing here reads the clock.
 */
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("shortDay", () => {
  it("drops the year for this year and keeps it for any other", () => {
    expect(shortDay(day(2026, 9, 18), NOW)).toBe("Sep 18");
    expect(shortDay(day(2025, 12, 31), NOW)).toBe("Dec 31, 2025");
  });

  it("reads a stored calendar day in UTC, so a due date never slips a day", () => {
    expect(shortDay(new Date("2026-10-02T00:00:00.000Z"), NOW)).toBe("Oct 2");
  });

  it("is empty for a missing or broken date", () => {
    expect(shortDay(null, NOW)).toBe("");
    expect(shortDay(undefined, NOW)).toBe("");
    expect(shortDay("not a date", NOW)).toBe("");
  });
});

describe("overdueLabel", () => {
  it("says nothing when the bill is not late, has no due date, or is settled", () => {
    expect(overdueLabel(day(2026, 10, 9), 4500, NOW)).toBeNull();
    expect(overdueLabel(null, 4500, NOW)).toBeNull();
    expect(overdueLabel(day(2026, 9, 1), 0, NOW)).toBeNull();
  });

  it("counts whole days in words", () => {
    expect(overdueLabel(day(2026, 10, 2), 4500, NOW)).toBe("1 day overdue");
    expect(overdueLabel(day(2026, 9, 21), 4500, NOW)).toBe("12 days overdue");
  });

  it("calls a bill due today 'Due today', not overdue", () => {
    expect(overdueLabel(day(2026, 10, 3), 4500, NOW)).toBe("Due today");
  });
});

describe("invoiceMoneyLine", () => {
  it("says how much is owed in words, in the alert tone once late", () => {
    expect(invoiceMoneyLine({ status: "SENT", balanceCents: 45000, overdue: false })).toEqual({ text: "$450.00 due", tone: "owed" });
    expect(invoiceMoneyLine({ status: "SENT", balanceCents: 45000, overdue: true })).toEqual({ text: "$450.00 due", tone: "overdue" });
  });

  it("shows only what is left on a part-paid bill", () => {
    expect(invoiceMoneyLine({ status: "PARTIAL", balanceCents: 2705, overdue: false }).text).toBe("$27.05 due");
  });

  it("says Paid when nothing is owed, using the refund-aware balance it is given", () => {
    expect(invoiceMoneyLine({ status: "PAID", balanceCents: 0, overdue: false })).toEqual({ text: "Paid", tone: "paid" });
  });

  it("explains a draft and a void instead of showing a debt", () => {
    expect(invoiceMoneyLine({ status: "DRAFT", balanceCents: 31464, overdue: false }).text).toBe("Not sent yet");
    expect(invoiceMoneyLine({ status: "VOID", balanceCents: 31464, overdue: false }).text).toBe("Voided");
  });
});

describe("invoiceCardLine", () => {
  const base = { createdAt: day(2026, 9, 18), dueDate: day(2026, 10, 2), paidAt: null, balanceCents: 45000 };

  it("raised date, then the due date, flagged late once it has passed", () => {
    expect(invoiceCardLine({ ...base, status: "SENT" }, NOW)).toEqual({ lead: "Raised Sep 18", tail: "due Oct 2", late: true });
    expect(invoiceCardLine({ ...base, status: "SENT", dueDate: day(2026, 10, 9) }, NOW)).toEqual({
      lead: "Raised Sep 18",
      tail: "due Oct 9",
      late: false,
    });
  });

  it("has no due part when there is no due date", () => {
    expect(invoiceCardLine({ ...base, status: "SENT", dueDate: null }, NOW).tail).toBeNull();
  });

  it("shows the paid date on a settled bill and never marks it late", () => {
    const line = invoiceCardLine({ ...base, status: "PAID", balanceCents: 0, paidAt: day(2026, 9, 25) }, NOW);
    expect(line).toEqual({ lead: "Paid Sep 25", tail: null, late: false });
  });

  it("a draft says when it was started; a void is never late", () => {
    expect(invoiceCardLine({ ...base, status: "DRAFT" }, NOW).lead).toBe("Started Sep 18");
    expect(invoiceCardLine({ ...base, status: "VOID" }, NOW)).toEqual({ lead: "Raised Sep 18", tail: null, late: false });
  });
});

describe("estimates", () => {
  it("says what happens next to a quote, in a few plain words", () => {
    expect(estimateMoneyLine("DRAFT").text).toBe("Not sent yet");
    expect(estimateMoneyLine("SENT").text).toBe("Waiting for a yes");
    expect(estimateMoneyLine("APPROVED").text).toBe("Ready to bill");
    expect(estimateMoneyLine("CONVERTED").text).toBe("Now an invoice");
  });

  it("shows an expiry only on an open quote, and flags it once it has passed", () => {
    const base = { createdAt: day(2026, 9, 28), expiresAt: day(2026, 10, 10), approvedAt: null };
    expect(estimateCardLine({ ...base, status: "SENT" }, NOW)).toEqual({ lead: "Written Sep 28", tail: "expires Oct 10", late: false });
    expect(estimateCardLine({ ...base, status: "SENT", expiresAt: day(2026, 10, 1) }, NOW)).toEqual({
      lead: "Written Sep 28",
      tail: "expired Oct 1",
      late: true,
    });
    // History, not something to chase.
    expect(estimateCardLine({ ...base, status: "CONVERTED", expiresAt: day(2026, 10, 1), approvedAt: day(2026, 9, 29) }, NOW)).toEqual({
      lead: "Approved Sep 29",
      tail: null,
      late: false,
    });
  });
});

describe("recurring schedules", () => {
  it("shows the next run, or that it was due, and nothing for a paused one", () => {
    expect(scheduleCardLine({ cadence: "Every month", nextRunAt: day(2026, 10, 18), active: true, due: false }, NOW)).toEqual({
      lead: "Every month",
      tail: "next on Oct 18",
      late: false,
    });
    expect(scheduleCardLine({ cadence: "Every month", nextRunAt: day(2026, 10, 1), active: true, due: true }, NOW).late).toBe(true);
    expect(scheduleCardLine({ cadence: "Every 3 months", nextRunAt: day(2026, 10, 18), active: false, due: false }, NOW).tail).toBeNull();
  });

  it("labels what a schedule does by itself", () => {
    expect(autoLabel(true, true)).toBe("Sends and charges itself");
    expect(autoLabel(true, false)).toBe("Sends itself");
    expect(autoLabel(false, true)).toBe("Charges itself");
    expect(autoLabel(false, false)).toBeNull();
  });

  it("counts invoices in words", () => {
    expect(invoicesSoFar(0)).toBe("No invoices yet");
    expect(invoicesSoFar(1)).toBe("1 invoice so far");
    expect(invoicesSoFar(3)).toBe("3 invoices so far");
  });

  it("matches a search on the name or the customer, any case, any part", () => {
    expect(matchesSchedule("", ["Anything"])).toBe(true);
    expect(matchesSchedule("  okon ", ["Support plan", "Okonkwo Dental Group"])).toBe(true);
    expect(matchesSchedule("retainer", ["Managed IT retainer", "Rivera"])).toBe(true);
    expect(matchesSchedule("zzz", ["Managed IT retainer", "Rivera"])).toBe(false);
  });

  it("capitalises the cadence sentence", () => {
    expect(sentenceCase("every month")).toBe("Every month");
    expect(sentenceCase("")).toBe("");
  });
});

describe("tab counts", () => {
  const rows = [
    { status: "DRAFT", _count: { _all: 1 } },
    { status: "SENT", _count: { _all: 3 } },
    { status: "PARTIAL", _count: { _all: 2 } },
    { status: "PAID", _count: { _all: 8 } },
    { status: "VOID", _count: { _all: 1 } },
  ];

  it("Unpaid is sent plus part-paid, the same set Home counts; All is everything", () => {
    const counts = invoiceTabCounts(rows);
    expect(counts["unpaid"]).toBe(5);
    expect(counts[""]).toBe(15);
    expect(counts["SENT"]).toBe(3);
    expect(counts["PAID"]).toBe(8);
  });

  it("an empty shop counts zero everywhere", () => {
    expect(invoiceTabCounts([])).toEqual({ "": 0, unpaid: 0 });
    expect(estimateTabCounts([])).toEqual({ "": 0 });
  });

  it("estimates have no combined view", () => {
    const counts = estimateTabCounts([
      { status: "DRAFT", _count: { _all: 1 } },
      { status: "SENT", _count: { _all: 1 } },
    ]);
    expect(counts).toEqual({ "": 2, DRAFT: 1, SENT: 1 });
  });
});
