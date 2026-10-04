import { describe, expect, it } from "vitest";

import {
  handedOverMessage,
  handOverNote,
  handOverQuestion,
  invoiceNote,
  invoiceQuestion,
  isPickupView,
  pickupCountWords,
  pickupEmpty,
  pickupMoney,
  pickupPlan,
  pickupSearchFields,
  readySince,
  toCollectWords,
  toPickupCard,
  type PickupInvoice,
} from "@/components/tickets/pickup-card-facts";

// Local-time dates on purpose: "since Tuesday" is the shop's own Tuesday.
const day = (month: number, date: number, hour = 12) => new Date(2026, month - 1, date, hour);
const now = day(10, 3).getTime(); // Saturday 3 Oct 2026, noon

const invoice = (over: Partial<PickupInvoice> & { totalCents?: number; paidCents?: number } = {}): PickupInvoice => {
  const { totalCents = 17_000, paidCents = 0, ...rest } = over;
  return {
    id: "inv_1",
    number: 1014,
    status: "SENT",
    taxRateBps: 0,
    lines: [{ quantity: 1, unitPriceCents: totalCents, taxable: false }],
    payments: paidCents > 0 ? [{ amountCents: paidCents }] : [],
    refunds: [],
    ...rest,
  };
};

describe("readySince", () => {
  it("says today, yesterday and the weekday while it is recent", () => {
    expect(readySince(day(10, 3, 8), now)).toEqual({ label: "Ready today", long: false });
    expect(readySince(day(10, 2, 23), now)).toEqual({ label: "Ready since yesterday", long: false });
    // Tuesday 29 Sep, four days before.
    expect(readySince(day(9, 29), now)).toEqual({ label: "Ready since Tuesday", long: false });
  });

  it("counts calendar days, so late last night is yesterday and not today", () => {
    expect(readySince(new Date(2026, 9, 2, 23, 59), new Date(2026, 9, 3, 0, 5).getTime()).label).toBe("Ready since yesterday");
  });

  it("switches to a date and the number of days after a week, and flags two weeks", () => {
    expect(readySince(day(9, 23), now)).toEqual({ label: "Ready since Sep 23 · 10 days", long: false });
    expect(readySince(day(9, 19), now)).toEqual({ label: "Ready since Sep 19 · 14 days", long: true });
  });

  it("adds the year for a date in another year", () => {
    expect(readySince(new Date(2025, 11, 1, 12), now).label).toBe("Ready since Dec 1, 2025 · 306 days");
  });

  it("falls back to plain words when the date is not known", () => {
    expect(readySince(null, now).label).toBe("Ready for pickup");
    expect(readySince(undefined, now).label).toBe("Ready for pickup");
    expect(readySince(new Date("nope"), now).label).toBe("Ready for pickup");
  });
});

describe("pickupMoney", () => {
  it("says Balance due with what is left and which invoice it is", () => {
    const money = pickupMoney([invoice({ paidCents: 5_000 })]);
    expect(money).toEqual({
      kind: "due",
      label: "Balance due",
      dueCents: 12_000,
      detail: "Invoice #1014 · $50.00 of $170.00 paid",
      invoiceId: "inv_1",
    });
  });

  it("names the total when nothing has been paid yet", () => {
    expect(pickupMoney([invoice()]).detail).toBe("Invoice #1014 · $170.00 total");
  });

  it("adds tax the way the invoice does", () => {
    const money = pickupMoney([invoice({ taxRateBps: 1000, lines: [{ quantity: 1, unitPriceCents: 10_000, taxable: true }] })]);
    expect(money.dueCents).toBe(11_000);
  });

  it("says Paid in full once payments cover the invoice", () => {
    const money = pickupMoney([invoice({ status: "PAID", paidCents: 17_000 })]);
    expect(money).toMatchObject({ kind: "paid", label: "Paid in full", dueCents: 0, invoiceId: "inv_1" });
    expect(money.detail).toBe("Invoice #1014 · $170.00 paid");
  });

  it("does not call a part-refunded invoice paid in full", () => {
    const money = pickupMoney([invoice({ status: "PARTIAL", paidCents: 17_000, refunds: [{ amountCents: 4_000, status: "completed" }] })]);
    expect(money).toMatchObject({ kind: "due", dueCents: 4_000 });
  });

  it("ignores a refund that failed", () => {
    const money = pickupMoney([invoice({ status: "PAID", paidCents: 17_000, refunds: [{ amountCents: 4_000, status: "failed" }] })]);
    expect(money.kind).toBe("paid");
  });

  it("notes an overpayment instead of hiding it", () => {
    const money = pickupMoney([invoice({ status: "PAID", paidCents: 17_500 })]);
    expect(money.kind).toBe("paid");
    expect(money.detail).toContain("overpaid by $5.00");
  });

  it("reads a nothing-to-pay invoice as nothing owed", () => {
    const money = pickupMoney([invoice({ totalCents: 0, status: "PAID" })]);
    expect(money).toMatchObject({ kind: "paid", label: "Nothing owed" });
    expect(money.detail).toBe("Invoice #1014 · no charge");
  });

  it("counts a draft invoice as money the customer will owe", () => {
    expect(pickupMoney([invoice({ status: "DRAFT" })]).kind).toBe("due");
  });

  it("ignores a voided invoice, as if there were none", () => {
    const money = pickupMoney([invoice({ status: "VOID" })]);
    expect(money).toMatchObject({ kind: "none", label: "No invoice yet", invoiceId: null });
  });

  it("adds up several open invoices and points at the one owing most", () => {
    const money = pickupMoney([
      invoice({ id: "inv_new", number: 1016, totalCents: 2_000 }),
      invoice({ id: "inv_big", number: 1014, totalCents: 17_000 }),
    ]);
    expect(money).toMatchObject({ kind: "due", dueCents: 19_000, invoiceId: "inv_big", detail: "2 invoices still open" });
  });

  it("does not let an overpaid invoice cancel out another one's balance", () => {
    const money = pickupMoney([invoice({ id: "a", totalCents: 5_000, paidCents: 9_000 }), invoice({ id: "b", number: 1015, totalCents: 3_000 })]);
    expect(money).toMatchObject({ kind: "due", dueCents: 3_000, invoiceId: "b" });
  });

  it("says no invoice yet, and what is waiting to be billed", () => {
    expect(pickupMoney([], { unbilledCharges: 2 })).toEqual({
      kind: "none",
      label: "No invoice yet",
      dueCents: 0,
      detail: "2 charges not billed yet",
      invoiceId: null,
    });
    expect(pickupMoney([], { unbilledCharges: 1 }).detail).toBe("1 charge not billed yet");
    expect(pickupMoney([]).detail).toBe("Nothing billed on this repair yet");
  });

  it("mentions a deposit that is being held", () => {
    expect(pickupMoney([], { unbilledCharges: 1, depositCents: 2_500 }).detail).toBe("1 charge not billed yet · Deposit $25.00 held");
    expect(pickupMoney([], { depositCents: 0 }).detail).toBe("Nothing billed on this repair yet");
  });
});

describe("pickupPlan: the one big button", () => {
  const due = pickupMoney([invoice()]);
  const paid = pickupMoney([invoice({ status: "PAID", paidCents: 17_000 })]);
  const none = pickupMoney([]);

  it("takes payment while money is owed, and keeps handing over as a quiet option", () => {
    expect(pickupPlan(due, false)).toEqual({ primary: "pay", openRepair: true, handOverAnyway: true });
  });

  it("hands over once it is paid", () => {
    expect(pickupPlan(paid, false)).toEqual({ primary: "handover", openRepair: true, handOverAnyway: false });
  });

  it("makes the invoice when there is none and something to bill", () => {
    expect(pickupPlan(none, true)).toEqual({ primary: "invoice", openRepair: true, handOverAnyway: true });
  });

  it("opens the repair when there is no invoice and nothing to bill, so the charges can be added", () => {
    expect(pickupPlan(none, false)).toEqual({ primary: "open", openRepair: false, handOverAnyway: true });
  });
});

describe("the words in the dialogs and toasts", () => {
  const due = pickupMoney([invoice({ paidCents: 5_000 })]);

  it("asks the question with the number and the customer's name", () => {
    expect(handOverQuestion(1008, "Owen Fitzgerald")).toBe("Hand #1008 over to Owen Fitzgerald?");
    expect(handedOverMessage(1008, "Owen Fitzgerald")).toBe("#1008 handed over to Owen Fitzgerald.");
    expect(invoiceQuestion(1008)).toBe("Create an invoice for #1008?");
  });

  it("warns about money still owed, or a missing invoice, before handing over", () => {
    expect(handOverNote(due)).toContain("They still owe $120.00.");
    expect(handOverNote(pickupMoney([]))).toContain("There is no invoice on this repair.");
    const paid = handOverNote(pickupMoney([invoice({ status: "PAID", paidCents: 17_000 })]));
    expect(paid).toBe("This closes the repair and marks the device as collected.");
  });

  it("counts the charges the new invoice will take", () => {
    expect(invoiceNote(1)).toContain("1 charge not billed yet goes onto a new invoice");
    expect(invoiceNote(3)).toContain("3 charges not billed yet go onto a new invoice");
  });
});

describe("header and empty view words", () => {
  it("counts what is waiting, or what matches while searching", () => {
    expect(pickupCountWords(3, false)).toBe("3 waiting");
    expect(pickupCountWords(1, true)).toBe("1 match");
    expect(pickupCountWords(0, true)).toBe("0 matches");
  });

  it("totals what is left to collect, or says nothing when nothing is", () => {
    const due = pickupMoney([invoice({ paidCents: 5_000 })]);
    const other = pickupMoney([invoice({ id: "x", number: 7, totalCents: 3_000 })]);
    const paid = pickupMoney([invoice({ status: "PAID", paidCents: 17_000 })]);
    expect(toCollectWords([due, other, paid, pickupMoney([])])).toBe("$150.00 to collect");
    expect(toCollectWords([paid])).toBeNull();
    expect(toCollectWords([])).toBeNull();
  });

  it("names the empty shelf and sends you to Repairs", () => {
    expect(pickupEmpty("")).toEqual({
      title: "Nothing is waiting for pickup",
      hint: "Repairs you mark Ready for pickup will show up here.",
      action: "repairs",
    });
    expect(pickupEmpty("   ").action).toBe("repairs");
  });

  it("tells a search that found nothing apart from an empty shelf", () => {
    const empty = pickupEmpty(" zzzz ");
    expect(empty.title).toBe('Nothing ready matches "zzzz"');
    expect(empty.action).toBe("clear");
  });
});

describe("isPickupView", () => {
  it("is the plain Ready for pickup view, in the shop's own spelling", () => {
    expect(isPickupView({ status: "Ready for Pickup", due: "all" })).toBe(true);
    expect(isPickupView({ status: "ready for pickup", due: "all" })).toBe(true);
  });

  it("is not any other view, nor a due lens that overrides the status", () => {
    for (const status of ["open", "all", "needs-reply", "Resolved", "In Progress"]) {
      expect(isPickupView({ status, due: "all" })).toBe(false);
    }
    expect(isPickupView({ status: "Ready for Pickup", due: "overdue" })).toBe(false);
    expect(isPickupView({ status: "Ready for Pickup", due: "today" })).toBe(false);
  });
});

describe("pickupSearchFields", () => {
  const base = { status: "Ready for Pickup", tech: "all", problemType: "all", sort: "created", customerId: "" };

  it("keeps the view and nothing else when no filter is set", () => {
    expect(pickupSearchFields(base)).toEqual([["status", "Ready for Pickup"]]);
  });

  it("carries every filter that is set, so a search never widens the list", () => {
    expect(pickupSearchFields({ ...base, tech: "u_9", problemType: "Screen", sort: "due", customerId: "c_1" })).toEqual([
      ["status", "Ready for Pickup"],
      ["tech", "u_9"],
      ["problemType", "Screen"],
      ["sort", "due"],
      ["customerId", "c_1"],
    ]);
  });
});

describe("toPickupCard", () => {
  const ticket = {
    id: "t_1",
    number: 1015,
    subject: "Latitude 5420 - fan roars",
    customer: { firstName: "Daniel", lastName: "Brooks", businessName: null },
    asset: { type: "Laptop", make: "Dell", model: "Latitude 5420" },
    depositCents: 0,
    updatedAt: day(10, 1),
  };

  it("uses the mobile as the number, the timeline entry as the ready date, and the invoices for the money", () => {
    const card = toPickupCard(ticket, {
      id: "t_1",
      customer: { phone: "(512) 555-0100", mobile: "(512) 555-0145" },
      comments: [{ createdAt: day(9, 29) }],
      invoices: [invoice()],
      _count: { charges: 0 },
    });
    expect(card.phone).toBe("(512) 555-0145");
    expect(card.readySince).toEqual(day(9, 29));
    expect(card.money.kind).toBe("due");
  });

  it("falls back to the office phone, and to the last update when no timeline entry says when", () => {
    const card = toPickupCard(ticket, { id: "t_1", customer: { phone: "(512) 555-0100", mobile: null }, comments: [] });
    expect(card.phone).toBe("(512) 555-0100");
    expect(card.readySince).toEqual(ticket.updatedAt);
  });

  it("has no phone for a customer with no number, and reads missing details as no invoice", () => {
    const card = toPickupCard(ticket, { id: "t_1", customer: { phone: null, mobile: null } });
    expect(card.phone).toBeNull();
    expect(card.money.kind).toBe("none");
    expect(card.unbilledCharges).toBe(0);
    expect(toPickupCard(ticket, undefined).money.kind).toBe("none");
  });

  it("carries the unbilled charge count and the deposit into the no-invoice words", () => {
    const card = toPickupCard({ ...ticket, depositCents: 2_500 }, { id: "t_1", _count: { charges: 2 } });
    expect(card.unbilledCharges).toBe(2);
    expect(card.money.detail).toBe("2 charges not billed yet · Deposit $25.00 held");
  });
});
