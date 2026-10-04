import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The buttons only need the actions and a router to exist; nothing is pressed in a static render.
vi.mock("@/app/(app)/tickets/actions", () => ({ markPickedUpAction: vi.fn(), makeInvoiceAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(),
}));

const { PickupCard } = await import("@/components/tickets/pickup-card");
const { PickupCounter } = await import("@/components/tickets/pickup-counter");
const { handOverNote, pickupMoney, pickupPlan, toCollectWords, toPickupCard } = await import(
  "@/components/tickets/pickup-card-facts"
);
import type { PickupCardData, PickupInvoice } from "@/components/tickets/pickup-card-facts";

/**
 * The reviewer's problem: a repair that HAS an invoice, with charges added
 * after it (addChargeAction does not look at invoices), used to say a green
 * "Paid in full" and make Hand over the big button while money was unbilled.
 */

const now = new Date(2026, 9, 3, 12).getTime();
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const SIDE_STRIPE = /border-[lrse]-(?:[1-9]|status-|accent|destructive|ring|border-strong)/;

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

const paidInvoice = () => invoice({ status: "PAID", paidCents: 17_000 });

describe("pickupMoney: an invoice plus charges nobody has billed", () => {
  it("never says Paid in full while charges are still unbilled; the words say so", () => {
    const money = pickupMoney([paidInvoice()], { unbilledCharges: 2 });
    expect(money).toEqual({
      kind: "unbilled",
      label: "Paid, but 2 charges not billed yet",
      dueCents: 0,
      detail: "Invoice #1014 · $170.00 paid",
      invoiceId: "inv_1",
    });
    expect(money.label).not.toContain("Paid in full");
  });

  it("uses the singular for one charge", () => {
    expect(pickupMoney([paidInvoice()], { unbilledCharges: 1 }).label).toBe("Paid, but 1 charge not billed yet");
  });

  it("keeps Balance due for the invoice that is open, and adds what is not billed to the detail", () => {
    const money = pickupMoney([invoice({ paidCents: 5_000 })], { unbilledCharges: 2 });
    expect(money).toMatchObject({ kind: "due", label: "Balance due", dueCents: 12_000, invoiceId: "inv_1" });
    expect(money.detail).toBe("Invoice #1014 · $50.00 of $170.00 paid · 2 charges not billed yet");
  });

  it("adds it to the several-invoices detail too", () => {
    const money = pickupMoney([invoice({ id: "a", number: 1014 }), invoice({ id: "b", number: 1016, totalCents: 2_000 })], {
      unbilledCharges: 1,
    });
    expect(money.detail).toBe("2 invoices still open · 1 charge not billed yet");
  });

  it("reads a no-charge invoice with charges waiting as what it is, not as Nothing owed", () => {
    const money = pickupMoney([invoice({ totalCents: 0, status: "PAID" })], { unbilledCharges: 3 });
    expect(money.kind).toBe("unbilled");
    expect(money.label).toBe("3 charges not billed yet");
    expect(money.label).not.toContain("Nothing owed");
  });

  it("still says Paid in full when nothing is waiting, and ignores a zero or odd count", () => {
    for (const unbilledCharges of [0, undefined, -1, Number.NaN]) {
      const money = pickupMoney([paidInvoice()], { unbilledCharges });
      expect(money).toMatchObject({ kind: "paid", label: "Paid in full" });
    }
  });

  it("does not count a voided invoice as the one that was paid", () => {
    expect(pickupMoney([invoice({ status: "VOID", paidCents: 17_000 })], { unbilledCharges: 2 }).kind).toBe("none");
  });

  it("adds nothing to what is left to collect: the amount of unbilled charges is not known here", () => {
    const money = pickupMoney([paidInvoice()], { unbilledCharges: 2 });
    expect(toCollectWords([money])).toBeNull();
  });
});

describe("pickupPlan: unbilled charges make Create invoice the big button", () => {
  it("makes the invoice first and keeps handing over as the quiet 'anyway'", () => {
    const money = pickupMoney([paidInvoice()], { unbilledCharges: 2 });
    expect(pickupPlan(money, true)).toEqual({ primary: "invoice", openRepair: true, handOverAnyway: true });
  });

  it("still takes payment first while the invoice is open", () => {
    const money = pickupMoney([invoice()], { unbilledCharges: 2 });
    expect(pickupPlan(money, true)).toEqual({ primary: "pay", openRepair: true, handOverAnyway: true });
  });

  it("is unchanged for a settled repair with nothing to bill", () => {
    expect(pickupPlan(pickupMoney([paidInvoice()]), false)).toEqual({
      primary: "handover",
      openRepair: true,
      handOverAnyway: false,
    });
  });
});

describe("handOverNote: the confirm dialog warns about unbilled charges", () => {
  it("says so when the money is settled but charges are not billed", () => {
    const money = pickupMoney([paidInvoice()], { unbilledCharges: 2 });
    expect(handOverNote(money, 2)).toBe(
      "2 charges are not billed yet. This closes the repair and marks the device as collected.",
    );
    expect(handOverNote(pickupMoney([paidInvoice()], { unbilledCharges: 1 }), 1)).toContain("1 charge is not billed yet.");
  });

  it("adds it after the amount owed, and after a missing invoice", () => {
    const due = pickupMoney([invoice({ paidCents: 5_000 })], { unbilledCharges: 1 });
    expect(handOverNote(due, 1)).toBe(
      "They still owe $120.00. 1 charge is not billed yet. This closes the repair and marks the device as collected.",
    );
    expect(handOverNote(pickupMoney([], { unbilledCharges: 2 }), 2)).toBe(
      "There is no invoice on this repair. 2 charges are not billed yet. This closes the repair and marks the device as collected.",
    );
  });

  it("is the plain sentence when nothing is waiting", () => {
    expect(handOverNote(pickupMoney([paidInvoice()]))).toBe("This closes the repair and marks the device as collected.");
    expect(handOverNote(pickupMoney([paidInvoice()]), 0)).toBe("This closes the repair and marks the device as collected.");
  });
});

describe("toPickupCard: the list's details carry an invoice and unbilled charges together", () => {
  const ticket = {
    id: "t_1",
    number: 1001,
    subject: "Screen swap",
    customer: { firstName: "Mia", lastName: "Chen", businessName: null },
    asset: { type: "Phone", make: "Apple", model: "iPhone 13" },
    updatedAt: new Date(2026, 9, 1, 12),
  };

  it("does not call it paid in full", () => {
    const card = toPickupCard(ticket, { id: "t_1", invoices: [paidInvoice()], _count: { charges: 2 } });
    expect(card.unbilledCharges).toBe(2);
    expect(card.money).toMatchObject({ kind: "unbilled", label: "Paid, but 2 charges not billed yet" });
  });
});

const card = (over: Partial<PickupCardData> = {}): PickupCardData => ({
  id: "t_1",
  number: 1001,
  subject: "Screen swap",
  customer: { firstName: "Mia", lastName: "Chen", businessName: null },
  asset: { type: "Phone", make: "Apple", model: "iPhone 13" },
  attachments: [],
  phone: "(512) 555-0189",
  readySince: new Date(2026, 8, 29, 12),
  money: pickupMoney([paidInvoice()], { unbilledCharges: 2 }),
  unbilledCharges: 2,
  ...over,
});

const render = (data: PickupCardData) => html(React.createElement(PickupCard, { card: data, now }));
const buttonLabels = (markup: string) =>
  [...markup.matchAll(/<(?:button|a)\b[^>]*data-slot="button"[^>]*>([^]*?)<\/(?:button|a)>/g)].map((match) =>
    match[1].replace(/<[^>]*>/g, "").trim(),
  );

describe("PickupCard: paid, but charges not billed yet", () => {
  const paidUnbilled = card();
  const out = render(paidUnbilled);

  it("says it in words and never claims Paid in full", () => {
    expect(out).toContain("Paid, but 2 charges not billed yet");
    expect(out).toContain("Invoice #1014 · $170.00 paid");
    expect(out).not.toContain("Paid in full");
    expect(out).not.toContain("Balance due");
  });

  it("makes Create invoice the one big button, with Open repair and Hand over anyway beside it", () => {
    expect(buttonLabels(out)).toEqual(["Create invoice", "Open repair", "Hand over anyway"]);
    expect(out).not.toContain("Take payment");
  });

  it("is not tinted the green of a settled repair", () => {
    expect(out).not.toContain("bg-status-resolved-bg");
    expect(out).toContain("bg-status-in-progress-bg");
    // The handed-over / paid tick is not the icon here.
    expect(render(card({ money: pickupMoney([paidInvoice()]), unbilledCharges: 0 }))).toContain("bg-status-resolved-bg");
  });

  it("keeps the kit rules: no side stripe, no hex colour, buttons 48px or taller", () => {
    expect(out).not.toMatch(SIDE_STRIPE);
    expect(out).not.toMatch(/\[#[0-9a-fA-F]{3,8}\]/);
    for (const match of out.matchAll(/<(?:button|a)\b[^>]*data-slot="button"[^>]*class="([^"]*)"|<(?:button|a)\b[^>]*class="([^"]*)"[^>]*data-slot="button"/g)) {
      expect(match[1] ?? match[2]).toMatch(/\bh-1[2-9]\b/);
    }
  });
});

describe("PickupCard: balance due, and charges not billed yet", () => {
  const dueUnbilled = card({ money: pickupMoney([invoice({ paidCents: 5_000 })], { unbilledCharges: 2 }) });
  const out = render(dueUnbilled);

  it("keeps Balance due and the amount, and says in words that more is waiting to be billed", () => {
    expect(out).toContain("Balance due");
    expect(out).toContain("$120.00");
    expect(out).toContain("Invoice #1014 · $50.00 of $170.00 paid · 2 charges not billed yet");
  });

  it("still makes Take payment the one big button", () => {
    expect(buttonLabels(out)).toEqual(["Take payment", "Open repair", "Hand over anyway"]);
  });
});

describe("PickupCounter: the header total ignores unbilled charges it cannot price", () => {
  it("shows only what is owed on open invoices", () => {
    const due = card({ id: "t_2", money: pickupMoney([invoice({ paidCents: 5_000 })], { unbilledCharges: 1 }), unbilledCharges: 1 });
    const out = html(
      React.createElement(PickupCounter, {
        now,
        total: 2,
        q: "",
        tabs: null,
        pager: null,
        searchFields: [["status", "Ready for Pickup"]] as [string, string][],
        clearHref: "/tickets?status=Ready+for+Pickup",
        repairsHref: "/tickets",
        showTotals: true,
        cards: [card(), due],
      }),
    );
    expect(out).toContain("$120.00 to collect");
    expect(out.match(/<article\b/g)).toHaveLength(2);
  });
});
