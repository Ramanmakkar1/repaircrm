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
const { pickupMoney } = await import("@/components/tickets/pickup-card-facts");
import type { PickupCardData, PickupInvoice } from "@/components/tickets/pickup-card-facts";

const now = new Date(2026, 9, 3, 12).getTime();
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

// A coloured stripe down a card edge: a 2px+ side border, or a side border in a status/accent colour.
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

const card = (over: Partial<PickupCardData> = {}): PickupCardData => ({
  id: "t_1",
  number: 1008,
  subject: "ThinkPad T14 - pop-ups and browser redirects",
  customer: { firstName: "Owen", lastName: "Fitzgerald", businessName: null },
  asset: { type: "Laptop", make: "Lenovo", model: "ThinkPad T14 Gen 3" },
  attachments: [],
  phone: "(512) 555-0189",
  readySince: new Date(2026, 8, 29, 12),
  money: pickupMoney([invoice({ paidCents: 5_000 })]),
  unbilledCharges: 0,
  ...over,
});

const due = card();
const paid = card({ money: pickupMoney([invoice({ status: "PAID", paidCents: 17_000 })]) });
const noInvoice = card({ money: pickupMoney([], { unbilledCharges: 2 }), unbilledCharges: 2 });
const nothingToBill = card({ money: pickupMoney([]), unbilledCharges: 0 });

const render = (data: PickupCardData) => html(React.createElement(PickupCard, { card: data, now }));
const buttonLabels = (markup: string) =>
  [...markup.matchAll(/<(?:button|a)\b[^>]*data-slot="button"[^>]*>([^]*?)<\/(?:button|a)>/g)].map((match) =>
    // The visible label: each button also names its repair for screen readers (sr-only), checked in fix-repairs-pickup.
    match[1].replace(/<span class="sr-only">[^]*?<\/span>/g, "").replace(/<[^>]*>/g, "").trim(),
  );

describe("PickupCard: the top", () => {
  const out = render(due);

  it("leads with the number and the customer, the line about the device, and when it became ready in words", () => {
    expect(out).toContain("#1008 · Owen Fitzgerald");
    expect(out).toContain("ThinkPad T14 - pop-ups and browser redirects");
    expect(out).toContain("Ready since Tuesday");
  });

  it("opens the repair from the title link", () => {
    expect(out).toContain('href="/tickets/t_1"');
  });

  it("shows the device-family picture, or the real intake photo when there is one", () => {
    expect(out).toContain("/images/products/laptop.webp");
    const photo = render(card({ attachments: [{ id: "f_9", fileName: "receipt.png" }, { id: "f_10", fileName: "device-front.jpg" }] }));
    expect(photo).toContain('src="/files/f_10"');
  });

  it("makes the phone number a tap-to-call link that is a sibling of the repair link, never inside it", () => {
    expect(out).toContain('href="tel:5125550189"');
    expect(out).toContain("(512) 555-0189");
    expect(out).toContain("Call Owen Fitzgerald");
    // The only anchor around the title closes before the phone anchor opens.
    const title = out.indexOf('href="/tickets/t_1"');
    const closeTitle = out.indexOf("</a>", title);
    expect(out.indexOf('href="tel:', title)).toBeGreaterThan(closeTitle);
    // And no anchor sits inside another.
    for (const anchor of out.match(/<a\b[^>]*>[^]*?<\/a>/g) ?? []) {
      expect(anchor.slice(2)).not.toMatch(/<a\b/);
    }
  });

  it("leaves the phone out when the customer has no number", () => {
    expect(render(card({ phone: null }))).not.toContain("tel:");
  });

  it("flags a device that has waited two weeks or more, in words", () => {
    const long = render(card({ readySince: new Date(2026, 8, 10, 12) }));
    expect(long).toContain("Ready since Sep 10 · 23 days");
    expect(long).toContain("bg-destructive-soft");
    expect(out).not.toContain("bg-destructive-soft");
  });

  it("uses a business name as the customer", () => {
    const business = render(card({ customer: { firstName: "Owen", lastName: "Fitzgerald", businessName: "Fitzgerald & Sons Ltd" } }));
    expect(business).toContain("#1008 · Fitzgerald &amp; Sons Ltd");
  });
});

describe("PickupCard: balance due", () => {
  const out = render(due);

  it("says Balance due with the amount and which invoice", () => {
    expect(out).toContain("Balance due");
    expect(out).toContain("$120.00");
    expect(out).toContain("Invoice #1014 · $50.00 of $170.00 paid");
  });

  it("makes Take payment the one big button, to the invoice, with Open repair and Hand over anyway beside it", () => {
    expect(out).toContain('href="/invoices/inv_1"');
    expect(buttonLabels(out)).toEqual(["Take payment", "Open repair", "Hand over anyway"]);
    expect(out).not.toContain("Paid in full");
  });
});

describe("PickupCard: paid in full", () => {
  const out = render(paid);

  it("says Paid in full, with no amount owing", () => {
    expect(out).toContain("Paid in full");
    expect(out).toContain("Invoice #1014 · $170.00 paid");
    expect(out).not.toContain("Balance due");
  });

  it("makes Hand over the one big button, and offers only Open repair beside it", () => {
    expect(buttonLabels(out)).toEqual(["Hand over", "Open repair"]);
    expect(out).not.toContain("Take payment");
    expect(out).not.toContain("Hand over anyway");
  });
});

describe("PickupCard: no invoice yet", () => {
  it("says No invoice yet and offers to create one when something is waiting to be billed", () => {
    const out = render(noInvoice);
    expect(out).toContain("No invoice yet");
    expect(out).toContain("2 charges not billed yet");
    expect(buttonLabels(out)).toEqual(["Create invoice", "Open repair", "Hand over anyway"]);
    expect(out).not.toContain("Take payment");
  });

  it("goes to the repair, to add charges, when there is nothing to bill", () => {
    const out = render(nothingToBill);
    expect(out).toContain("No invoice yet");
    expect(out).toContain("Nothing billed on this repair yet");
    expect(buttonLabels(out)).toEqual(["Open repair", "Hand over anyway"]);
  });
});

describe("PickupCard: long names and the kit rules", () => {
  const long = card({
    number: 1042,
    subject: "MacBook Pro 16-inch liquid damage - logic board replacement, battery swap, keyboard and trackpad replacement and full data recovery from the failed SSD",
    customer: {
      firstName: "Bartholomew-Maximilian",
      lastName: "Featherstonehaugh-Cholmondeley",
      businessName: null,
    },
    phone: "+44 20 7946 0958",
  });
  const out = render(long);

  it("lets the title and the line wrap instead of pushing the card sideways", () => {
    expect(out).toContain("#1042 · Bartholomew-Maximilian Featherstonehaugh-Cholmondeley");
    expect(out).toMatch(/class="[^"]*line-clamp-2[^"]*break-words/);
    expect(out).toContain('href="tel:+442079460958"');
    // Nothing in the card is a single unwrappable fixed width.
    expect(out).not.toMatch(/\bw-\[\d{3,}px\]/);
  });

  it("is an article named for the repair, so a screen reader can jump between cards", () => {
    expect(out).toContain('<article aria-label="Repair #1042 for Bartholomew-Maximilian Featherstonehaugh-Cholmondeley"');
  });

  it("has no coloured side stripe, no hex colours and no bare white fills, in any state", () => {
    for (const data of [due, paid, noInvoice, nothingToBill, long]) {
      const markup = render(data);
      expect(markup).not.toMatch(SIDE_STRIPE);
      expect(markup).not.toMatch(/border-[lr]\b(?!-)/);
      expect(markup).not.toMatch(/\[#[0-9a-fA-F]{3,8}\]/);
      expect(markup).not.toMatch(/(?:style|fill|stroke)="#[0-9a-fA-F]{3,8}"/);
      // The device picture's own white canvas is the one allowed `bg-white`.
      expect(markup.replace(/<span class="[^"]*bg-white[^"]*"/g, "")).not.toMatch(/\bbg-white\b/);
    }
  });

  it("keeps every button 48px or taller", () => {
    for (const data of [due, paid, noInvoice, nothingToBill]) {
      const markup = render(data);
      for (const match of markup.matchAll(/<(?:button|a)\b[^>]*data-slot="button"[^>]*class="([^"]*)"|<(?:button|a)\b[^>]*class="([^"]*)"[^>]*data-slot="button"/g)) {
        expect(match[1] ?? match[2]).toMatch(/\bh-1[2-9]\b/);
      }
    }
  });
});

describe("PickupCounter", () => {
  const props = {
    now,
    total: 3,
    q: "",
    tabs: React.createElement("nav", null, "TABS-SLOT"),
    pager: React.createElement("p", null, "PAGER-SLOT"),
    searchFields: [["status", "Ready for Pickup"]] as [string, string][],
    clearHref: "/tickets?status=Ready+for+Pickup",
    repairsHref: "/tickets",
    showTotals: true,
  };

  const out = html(React.createElement(PickupCounter, { ...props, cards: [due, paid, noInvoice] }));

  it("has the big header with the count, the one line, the tabs and the pager", () => {
    expect(out).toContain("<h1");
    expect(out).toContain("Ready for pickup");
    expect(out).toContain("3 waiting");
    expect(out).toContain("Hand the device back and collect payment.");
    expect(out).toContain("TABS-SLOT");
    expect(out).toContain("PAGER-SLOT");
  });

  it("totals what is left to collect across the cards", () => {
    expect(out).toContain("$120.00 to collect");
  });

  it("leaves the total out when the cards on screen are only some of the list", () => {
    const partial = html(React.createElement(PickupCounter, { ...props, showTotals: false, cards: [due] }));
    expect(partial).not.toContain("to collect");
  });

  it("draws one card per repair", () => {
    expect(out.match(/<article\b/g)).toHaveLength(3);
  });

  it("has one big search that posts to Repairs and keeps the view in a hidden field", () => {
    expect(out).toMatch(/<form\b[^>]*role="search"[^>]*action="\/tickets"[^>]*method="get"/);
    expect(out).toContain('type="hidden" name="status" value="Ready for Pickup"');
    expect(out).toContain('name="q"');
    expect(out).toContain('placeholder="Search name, phone or #"');
    expect(out).toContain("h-14");
    // Not searching yet, so no Clear.
    expect(out).not.toContain(">Clear<");
  });

  it("shows what was typed, says matches, and offers Clear while searching", () => {
    const searching = html(React.createElement(PickupCounter, { ...props, q: "owen", total: 1, cards: [due] }));
    expect(searching).toContain('value="owen"');
    expect(searching).toContain("1 match");
    expect(searching).toContain(">Clear<");
    expect(searching).toContain('href="/tickets?status=Ready+for+Pickup"');
  });

  it("says Nothing is waiting for pickup, with a button to Repairs, when the shelf is empty", () => {
    const empty = html(React.createElement(PickupCounter, { ...props, total: 0, cards: [] }));
    expect(empty).toContain("Nothing is waiting for pickup");
    expect(empty).toContain('href="/tickets"');
    expect(empty).toContain("Go to Repairs");
    expect(empty).not.toContain("PAGER-SLOT");
    expect(empty).not.toContain("<article");
  });

  it("says a search found nothing, and offers to clear it, when it did", () => {
    const none = html(React.createElement(PickupCounter, { ...props, q: "zzzz", total: 0, cards: [] }));
    expect(none).toContain("Nothing ready matches &quot;zzzz&quot;");
    expect(none).toContain("Clear search");
    expect(none).toContain("Go to Repairs");
  });
});
