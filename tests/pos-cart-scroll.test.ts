import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/pos/actions", () => ({
  checkoutAction: vi.fn(),
  posSquareTerminalCheckoutAction: vi.fn(),
  posTerminalIntentAction: vi.fn(),
}));
vi.mock("@/app/(app)/pos/drawers/actions", () => ({
  openDrawerAction: vi.fn(),
  closeDrawerAction: vi.fn(),
  getDrawerSummaryAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pos",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; className?: string }) =>
    createElement("img", { alt: props.alt, className: props.className }),
}));

const { TerminalCart } = await import("@/components/pos/terminal-cart");
const { cartScrollTarget, lineCounts } = await import("@/components/pos/terminal-logic");
const { calcTotals } = await import("@/lib/money");

import type { CartLine, PosCustomer } from "@/components/pos/types";

/**
 * After picking a repair the cart used to scroll to the BOTTOM, past the
 * "Repair #N / Remove" header, and on a 1024x768 counter the lines area was left
 * about 160px tall. The scroll rule is pure and checked first; then the markup that
 * keeps Remove in reach and the totals short.
 */

const loose = (key: string): CartLine => ({
  key,
  productId: "p1",
  name: "Tempered Glass Protector",
  unitPriceCents: 2499,
  taxable: true,
  quantity: 1,
  stockQty: 12,
});

const repairLine = (key: string, chargeId: string): CartLine => ({
  key,
  productId: null,
  name: "Ticket #1014 — Galaxy Tab A8 digitizer",
  unitPriceCents: 11900,
  taxable: true,
  quantity: 1,
  stockQty: null,
  ticketChargeId: chargeId,
  ticketId: "t1",
  ticketNumber: 1014,
});

describe("lineCounts", () => {
  it("splits the cart into repair lines and loose lines", () => {
    expect(lineCounts([])).toEqual({ ticket: 0, loose: 0 });
    expect(lineCounts([repairLine("a", "c1"), repairLine("b", "c2"), loose("c")])).toEqual({
      ticket: 2,
      loose: 1,
    });
  });
});

describe("cartScrollTarget", () => {
  it("scrolls UP to the repair header when a repair arrives, even on top of loose items", () => {
    expect(cartScrollTarget({ ticket: 0, loose: 0 }, { ticket: 2, loose: 0 })).toBe("top");
    expect(cartScrollTarget({ ticket: 0, loose: 3 }, { ticket: 2, loose: 3 })).toBe("top");
  });

  it("scrolls DOWN to a loose item, which lands under everything else", () => {
    expect(cartScrollTarget({ ticket: 0, loose: 2 }, { ticket: 0, loose: 3 })).toBe("bottom");
    expect(cartScrollTarget({ ticket: 2, loose: 0 }, { ticket: 2, loose: 1 })).toBe("bottom");
  });

  it("leaves the scroll alone for a quantity step, a removal or no change", () => {
    expect(cartScrollTarget({ ticket: 0, loose: 2 }, { ticket: 0, loose: 2 })).toBeNull();
    expect(cartScrollTarget({ ticket: 0, loose: 3 }, { ticket: 0, loose: 2 })).toBeNull();
    expect(cartScrollTarget({ ticket: 2, loose: 1 }, { ticket: 0, loose: 1 })).toBeNull();
  });
});

const customers: PosCustomer[] = [
  { id: "c1", label: "Rivera Landscaping LLC — Tomas Rivera", creditBalanceCents: 7500, taxRateBps: 825, taxExempt: false },
];

function renderRepairCart(withDeposit: boolean) {
  const lines = [repairLine("r1", "ch1"), repairLine("r2", "ch2"), loose("l1")];
  const totals = calcTotals(lines, 825);
  const depositCents = withDeposit ? 7500 : 0;
  return renderToStaticMarkup(
    createElement(TerminalCart, {
      lines,
      products: [],
      totals,
      taxRateBps: 825,
      depositCents,
      dueCents: totals.totalCents - depositCents,
      customers,
      customerId: "c1",
      onCustomerChange: vi.fn(),
      onQuantityChange: vi.fn(),
      onRemove: vi.fn(),
      onClear: vi.fn(),
      onAddCustom: vi.fn(),
      onTender: vi.fn(),
      disabled: false,
      tickets: [],
      attachedTicketId: "t1",
      onPickTicket: vi.fn(),
      onRemoveTicket: vi.fn(),
    }),
  );
}

describe("TerminalCart: a repair with loose items", () => {
  const html = renderRepairCart(true);

  it("pins the 'Repair #N / Remove' header to the top of the lines, on a solid layer", () => {
    const header = html.match(/<div class="sticky top-0 z-10[^"]*">[\s\S]*?Remove<\/button>/)?.[0] ?? "";
    expect(header).toContain("Repair #1014");
    expect(header).toContain(">Remove<");
    // The solid layer stops the rows scrolling under it from showing through the tint.
    expect(header).toMatch(/^<div class="[^"]*\bbg-surface\b/);
    expect(header).not.toMatch(/(?:bg|text|border)-\[#/);
  });

  it("keeps Remove a 48px target", () => {
    const remove = html.match(/<button[^>]*>Remove<\/button>/)?.[0] ?? "";
    expect(remove).toContain("min-h-12");
  });

  it("keeps the lock note to the one reason on the tablet and the rest for screen readers", () => {
    expect(html).toContain("The customer is set by repair #1014.");
    expect(html).toMatch(/<span class="lg:sr-only"> Remove the repair to change it\.<\/span>/);
  });

  it("shows the deposit and the amount due on one row, in words", () => {
    const row = html.match(/<div class="mt-1 flex items-end[^"]*">[\s\S]*?<\/div><\/div><\/div>/)?.[0] ?? "";
    expect(row).toContain("Deposit on file");
    expect(row).toContain("−$75.00");
    expect(row).toContain("Due now");
    // Not two stacked totals rows any more.
    expect((html.match(/Deposit on file/g) ?? []).length).toBe(1);
    expect((html.match(/Due now/g) ?? []).length).toBe(1);
  });

  it("shows no deposit or due-now row when nothing was paid up front", () => {
    const noDeposit = renderRepairCart(false);
    expect(noDeposit).not.toContain("Deposit on file");
    expect(noDeposit).not.toContain("Due now");
    expect(noDeposit).toContain("Total");
  });
});
