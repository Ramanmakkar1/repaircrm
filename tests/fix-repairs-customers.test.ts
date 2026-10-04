import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const prefs = vi.hoisted(() => ({ simple: true }));
vi.mock("@/lib/prefs", () => ({ readUiPrefs: async () => ({ simple: prefs.simple }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/customers/c1",
  useSearchParams: () => new URLSearchParams(),
}));

const { PaymentsCard, TicketsCard } = await import("@/components/customers/activity-cards");
const { WarrantiesCard } = await import("@/components/customers/warranties-card");
const { default: EditCustomerLoading } = await import("@/app/(app)/customers/[id]/edit/loading");
const { default: CustomerHubLoading } = await import("@/app/(app)/customers/[id]/loading");

/**
 * Customer screen leftovers: 48px rows for the Payments and Warranties links,
 * dates in the shop's zone, the booking link, skeletons that match the Easy
 * screens, and "repair" (never "ticket") in the words staff read.
 */

const EDMONTON = "America/Edmonton";
const h = React.createElement;
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const read = (path: string) => readFileSync(path, "utf8");

const payments = [
  { id: "p1", amountCents: 30_207, method: "CARD", reference: "ch_3Q", createdAt: new Date(Date.UTC(2026, 9, 5, 1, 30)), invoice: { id: "inv_1", number: 1001 } },
];
const warranties = [
  { id: "w1", description: "iPhone 14 screen", invoiceId: "inv_1", invoiceNumber: 1001, soldAt: new Date(Date.UTC(2026, 9, 5, 1, 30)), expiresAt: new Date(Date.UTC(2027, 0, 3, 2, 0)), days: 90, active: true },
  { id: "w2", description: "Old battery", invoiceId: "inv_2", invoiceNumber: 990, soldAt: new Date(Date.UTC(2025, 0, 2, 18)), expiresAt: new Date(Date.UTC(2025, 3, 2, 18)), days: 90, active: false },
];

/** Every <a> in the markup with its classes. */
const links = (markup: string) => [...markup.matchAll(/<a\b([^>]*)>/g)].map((match) => match[1]);

describe("Payments in Easy mode", () => {
  it("is one big row per payment that opens its invoice, 56px tall, not a 20px '#1001' link", () => {
    const out = html(h(PaymentsCard, { payments, total: 1, easy: true, timeZone: EDMONTON }));
    const rows = links(out);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('href="/invoices/inv_1"');
    expect(rows[0]).toContain("min-h-14");
    expect(rows[0]).toContain("data-touch-control");
    expect(out).toMatch(/Invoice #(?:<!-- -->)?1001/);
    expect(out).toContain("$302.07");
    // The day it was taken on the shop's calendar (7:30 PM Oct 4 in Edmonton, Oct 5 in UTC).
    expect(out).toContain("Oct 4, 2026");
    expect(out).not.toContain("<table");
  });

  it("keeps the table in Full mode, dated in the shop's zone", () => {
    const out = html(h(PaymentsCard, { payments, total: 1, timeZone: EDMONTON }));
    expect(out).toContain("<table");
    expect(out).toContain("Oct 4, 2026");
  });
});

describe("Warranties in Easy mode", () => {
  it("is one big row per item that opens the invoice it was sold on, with Active or Expired in words", () => {
    const out = html(h(WarrantiesCard, { warranties, easy: true, timeZone: EDMONTON }));
    const rows = links(out);
    expect(rows.map((row) => row.match(/href="([^"]+)"/)?.[1])).toEqual(["/invoices/inv_1", "/invoices/inv_2"]);
    for (const row of rows) expect(row).toContain("min-h-14");
    expect(out).toContain("Active · Jan 2, 2027");
    expect(out).toContain("Expired · Apr 2, 2025");
    expect(out).toContain("Sold Oct 4, 2026");
    expect(out).not.toContain("<table");
    // Theme tokens only: no hex colour in any class.
    expect(out).not.toMatch(/class="[^"]*#[0-9a-fA-F]{3,8}/);
  });

  it("keeps the table in Full mode", () => {
    expect(html(h(WarrantiesCard, { warranties }))).toContain("<table");
  });
});

describe("plain words on the customer screens", () => {
  it("titles the repairs card Repairs in Full mode too", () => {
    const out = html(h(TicketsCard, { customerId: "c1", tickets: [], total: 0 }));
    expect(out).toContain(">Repairs<");
    expect(out).toContain("No repairs for this customer yet.");
    expect(out).not.toMatch(/[Tt]ickets?\b(?![^<]*")/);
  });

  it("never says ticket in the customer pages' words", () => {
    const sources = [
      "app/(app)/customers/page.tsx",
      "app/(app)/customers/[id]/page.tsx",
      "app/(app)/customers/[id]/edit/page.tsx",
      "app/(app)/customers/actions.ts",
      "components/customers/assets-card.tsx",
      "components/customers/activity-cards.tsx",
      "components/customers/format.ts",
    ].map(read);
    for (const source of sources) {
      // String literals and JSX text only; code names like `tickets` are not copy.
      const copy = [...source.matchAll(/"([^"\n]*)"|`([^`]*)`|>\s*([^<>{}\n]+?)\s*</g)].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
      const said = copy.filter((text) => /\btickets?\b/i.test(text) && !/[/_.]|^\w+$/.test(text));
      expect(said).toEqual([]);
    }
  });
});

describe("Book a visit", () => {
  it("opens the booking with this customer already chosen", () => {
    expect(read("app/(app)/customers/[id]/page.tsx")).toContain("bookHref={`/appointments?book=1&customerId=${customer.id}`}");
  });
});

describe("device tiles", () => {
  it("carry no dead min-h-44", () => {
    expect(read("components/customers/assets-card.tsx")).not.toContain("min-h-44");
  });
});

describe("skeletons that match the Easy screens", () => {
  it("draws the Easy edit page's shape (two boxes, five tiles, This customer) in Easy mode", async () => {
    prefs.simple = true;
    const out = html((await EditCustomerLoading()) as React.ReactElement);
    expect(out).toContain("max-w-6xl");
    expect(out).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(out.match(/sm:h-28/g)).toHaveLength(5);
  });

  it("keeps the one-column form skeleton in Full mode", async () => {
    prefs.simple = false;
    const out = html((await EditCustomerLoading()) as React.ReactElement);
    expect(out).toContain("max-w-3xl");
    expect(out).not.toContain("sm:h-28");
  });

  it("draws the Easy customer screen (header panel, summary, four tabs) in Easy mode", async () => {
    prefs.simple = true;
    const out = html((await CustomerHubLoading()) as React.ReactElement);
    expect(out).toContain("max-w-4xl");
    expect(out).toContain("rounded-full");
    expect(out.match(/h-12 flex-1 rounded-xl/g)).toHaveLength(4);
    prefs.simple = false;
    expect(html((await CustomerHubLoading()) as React.ReactElement)).toContain("lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]");
  });
});
