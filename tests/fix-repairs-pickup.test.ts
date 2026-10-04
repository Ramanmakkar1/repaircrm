import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/tickets/actions", () => ({ markPickedUpAction: vi.fn(), makeInvoiceAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(),
}));

const { PickupCard } = await import("@/components/tickets/pickup-card");
const { PickupCounter } = await import("@/components/tickets/pickup-counter");
const { PICKUP_TITLE_ID, pickupButtonContext, pickupMoney } = await import("@/components/tickets/pickup-card-facts");
import type { PickupCardData } from "@/components/tickets/pickup-card-facts";

/**
 * The pickup counter (Repairs > Ready for pickup, Easy mode): every button
 * names its repair for a screen reader, the money detail is readable, focus has
 * somewhere to go after a hand-over, and an empty search offers one Clear.
 */

const EDMONTON = "America/Edmonton";
const now = Date.UTC(2026, 9, 4, 14, 0); // Oct 4, 8 AM in Edmonton
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const card = (over: Partial<PickupCardData> = {}): PickupCardData => ({
  id: "t_1",
  number: 1015,
  subject: "Latitude 5420 - fan roars",
  customer: { firstName: "Daniel", lastName: "Brooks", businessName: null },
  asset: { type: "Laptop", make: "Dell", model: "Latitude 5420" },
  attachments: [],
  phone: "(512) 555-0145",
  readySince: new Date(Date.UTC(2026, 9, 4, 5, 0)), // Oct 3, 11 PM in Edmonton
  money: pickupMoney([
    {
      id: "inv_1",
      number: 1001,
      status: "PAID",
      taxRateBps: 0,
      lines: [{ quantity: 1, unitPriceCents: 30_207, taxable: false }],
      payments: [{ amountCents: 30_207 }],
      refunds: [],
    },
  ]),
  unbilledCharges: 0,
  ...over,
});

/** Every button's whole text, sr-only words included: what a screen reader announces. */
const accessibleNames = (markup: string) =>
  [...markup.matchAll(/<(?:button|a)\b[^>]*data-slot="button"[^>]*>([^]*?)<\/(?:button|a)>/g)].map((match) =>
    match[1].replace(/<[^>]*>/g, "").trim(),
  );

describe("pickup card buttons, for a screen reader", () => {
  it("says which repair each button is for: number, device and customer", () => {
    expect(pickupButtonContext(1015, "Dell Latitude 5420", "Daniel Brooks")).toBe("#1015, Dell Latitude 5420, Daniel Brooks");
    expect(pickupButtonContext(1015, null, "Daniel Brooks")).toBe("#1015, Daniel Brooks");
  });

  it("gives two cards' buttons different names", () => {
    const first = html(React.createElement(PickupCard, { card: card(), now, timeZone: EDMONTON }));
    const second = html(
      React.createElement(PickupCard, {
        card: card({ id: "t_2", number: 1001, customer: { firstName: "Elena", lastName: "Marquez", businessName: null }, asset: { type: "Phone", make: "Apple", model: "iPhone 14 Pro" } }),
        now,
        timeZone: EDMONTON,
      }),
    );
    expect(accessibleNames(first)).toEqual([
      "Hand over, #1015, Dell Latitude 5420, Daniel Brooks",
      "Open repair, #1015, Dell Latitude 5420, Daniel Brooks",
    ]);
    expect(accessibleNames(second)).toEqual([
      "Hand over, #1001, Apple iPhone 14 Pro, Elena Marquez",
      "Open repair, #1001, Apple iPhone 14 Pro, Elena Marquez",
    ]);
    // The extra words are for screen readers only; the visible label is unchanged.
    expect(first).toContain('<span class="sr-only">, #1015, Dell Latitude 5420, Daniel Brooks</span>');
  });

  it("names Take payment and Create invoice the same way", () => {
    const owing = card({
      money: pickupMoney([{ id: "inv_2", number: 1012, status: "SENT", taxRateBps: 0, lines: [{ quantity: 1, unitPriceCents: 9_500, taxable: false }], payments: [], refunds: [] }]),
    });
    expect(accessibleNames(html(React.createElement(PickupCard, { card: owing, now }))))
      .toContain("Take payment, #1015, Dell Latitude 5420, Daniel Brooks");
    const unbilled = card({ money: pickupMoney([], { unbilledCharges: 1 }), unbilledCharges: 1 });
    expect(accessibleNames(html(React.createElement(PickupCard, { card: unbilled, now }))))
      .toContain("Create invoice, #1015, Dell Latitude 5420, Daniel Brooks");
  });
});

describe("the money block", () => {
  it("prints its detail line in plain foreground text, not the state colour (4.3:1 on the green tint)", () => {
    const out = html(React.createElement(PickupCard, { card: card(), now }));
    expect(out).toMatch(/<p class="break-words text-sm leading-snug text-foreground">Invoice #1001 · \$302\.07 paid<\/p>/);
    // The label keeps the state's colour from the box, in words.
    expect(out).toContain("Paid in full");
  });

  it("counts Ready since on the shop's calendar", () => {
    const out = html(React.createElement(PickupCard, { card: card(), now, timeZone: EDMONTON }));
    expect(out).toContain("Ready since yesterday");
  });
});

describe("the pickup counter page", () => {
  const props = {
    now,
    timeZone: EDMONTON,
    total: 1,
    q: "",
    tabs: React.createElement("nav", null, "TABS"),
    pager: React.createElement("p", null, "PAGER"),
    searchFields: [["status", "Ready for Pickup"]] as [string, string][],
    clearHref: "/tickets?status=Ready+for+Pickup",
    repairsHref: "/tickets",
    showTotals: true,
  };

  it("has a title focus can be moved to (from script only) after the last card is handed over", () => {
    const out = html(React.createElement(PickupCounter, { ...props, cards: [card()] }));
    expect(out).toContain(`<h1 id="${PICKUP_TITLE_ID}" tabindex="-1"`);
  });

  it("offers one Clear, not two, when a search finds nothing", () => {
    const none = html(React.createElement(PickupCounter, { ...props, q: "zzzz", total: 0, cards: [] }));
    expect(none.match(/>Clear(?: search)?</g)).toEqual([">Clear search<"]);
  });

  it("keeps Clear by the search box while a search has matches", () => {
    const some = html(React.createElement(PickupCounter, { ...props, q: "daniel", cards: [card()] }));
    expect(some).toContain(">Clear<");
  });
});

describe("focus after a hand-over", () => {
  it("moves to the next card's title, else the one before, else the page title, and stops the dialog handing it back", () => {
    const source = readFileSync("components/tickets/pickup-card-actions.tsx", "utf8");
    expect(source).toContain("item?.nextElementSibling ?? item?.previousElementSibling");
    expect(source).toContain('querySelector<HTMLElement>("h2 a[href]")');
    expect(source).toContain("document.getElementById(PICKUP_TITLE_ID)");
    expect(source).toMatch(/onCloseAutoFocus=\{\(event\) => \{\s*if \(done\.current\) event\.preventDefault\(\);/);
  });
});
