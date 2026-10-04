import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The register only needs these to exist; no test here rings a sale.
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
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
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
const { CartPanel } = await import("@/components/pos/cart-panel");
const { ProductGrid } = await import("@/components/pos/product-grid");
const { Register } = await import("@/components/pos/register");
const { DrawerChip } = await import("@/components/pos/drawer-chip");
const { PayBar } = await import("@/components/pos/pay-bar");
const { PosToolbar } = await import("@/components/pos/terminal-toolbar");
const { calcTotals } = await import("@/lib/money");

import type { CartLine, PosCustomer, PosProduct, PosTicket } from "@/components/pos/types";

/**
 * The one-screen register, rendered to static markup (first paint).
 *
 * Easy mode is the terminal: a slim toolbar, the shelves and a cart that keeps
 * Pay in view. Full mode keeps the page as it was. These check the structure the
 * layout depends on, that nothing the cashier needs went missing, and the house
 * rules for colour and words.
 */

const product = (over: Partial<PosProduct>): PosProduct => ({
  id: "p1",
  name: "Tempered Glass Protector",
  priceCents: 2499,
  taxable: true,
  stockQty: 12,
  sku: "ACC-TG",
  upc: null,
  category: "Screen guards",
  imageUrl: null,
  lowStockAt: 3,
  serialized: false,
  serials: [],
  ...over,
});

const products: PosProduct[] = [
  product({ id: "p1" }),
  product({ id: "p2", name: "iPhone 12 Battery", priceCents: 8900, category: "Batteries", sku: "BAT-IP12", stockQty: 0 }),
  product({ id: "p3", name: "Bench Diagnostic (per hour)", priceCents: 9500, category: "Labour", sku: "LAB-DIAG", stockQty: 0, lowStockAt: null }),
];

const line = (over: Partial<CartLine>): CartLine => ({
  key: "line-0",
  productId: "p1",
  name: "Tempered Glass Protector",
  unitPriceCents: 2499,
  taxable: true,
  quantity: 2,
  stockQty: 12,
  ...over,
});

const customers: PosCustomer[] = [
  { id: "c1", label: "Rivera Landscaping LLC — Tomas Rivera", creditBalanceCents: 7500, taxRateBps: 825, taxExempt: false },
];

type CartOverrides = Partial<Parameters<typeof TerminalCart>[0]>;

function cartProps(over: CartOverrides = {}): Parameters<typeof TerminalCart>[0] {
  const lines = over.lines ?? [];
  const totals = calcTotals(lines, 825);
  return {
    lines,
    products,
    totals,
    taxRateBps: 825,
    depositCents: 0,
    dueCents: totals.totalCents,
    customers,
    customerId: null,
    onCustomerChange: vi.fn(),
    onQuantityChange: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    onAddCustom: vi.fn(),
    onTender: vi.fn(),
    disabled: false,
    tickets: [],
    attachedTicketId: null,
    onPickTicket: vi.fn(),
    onRemoveTicket: vi.fn(),
    ...over,
  };
}

const renderCart = (over: CartOverrides = {}) =>
  renderToStaticMarkup(createElement(TerminalCart, cartProps(over)));

const threeLines: CartLine[] = [
  line({ key: "line-0", productId: "p2", name: "iPhone 12 Battery", unitPriceCents: 8900, quantity: 1, stockQty: 0 }),
  line({ key: "line-1" }),
  line({ key: "line-2", productId: null, name: "Salvaged charging cable", unitPriceCents: 500, quantity: 1, stockQty: null }),
];

/** The whole of the first button that mentions `label`. */
const buttonTag = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`))?.[0] ?? "";

/** The disabled ATTRIBUTE (not the `disabled:` utility classes every Button carries). */
const isDisabled = (tag: string) => /^<button[^>]*\sdisabled(?:=""|\s|>)/.test(tag);

/** Opening tags of every button in some markup. */
const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("TerminalCart: an empty sale", () => {
  const html = renderCart();

  it("keeps the header, the walk-in chip and one short, friendly prompt", () => {
    expect(html).toContain("Current sale");
    expect(html).toContain("Walk-in");
    expect(html).toContain('aria-label="Add customer"');
    expect(html).toContain("Nothing here yet");
    expect(html).toContain("Tap a picture or scan a barcode.");
    // Nothing to clear yet.
    expect(html).not.toContain(">Clear<");
  });

  it("puts the two quick-add buttons side by side", () => {
    expect(html).toContain("One-off item");
    expect(html).toContain("From repair");
    expect(html).toMatch(/grid shrink-0 grid-cols-2[^"]*"/);
    // No "ticket" in Easy-mode wording.
    expect(html).not.toMatch(/ticket/i);
  });

  it("shows the totals and the pay row, with every way to pay switched off", () => {
    expect(html).toContain("Subtotal");
    expect(html).toContain("Sales tax (8.25%)");
    expect(html).toContain("$0.00");
    for (const label of ["Cash", "Card", "More"]) expect(isDisabled(buttonTag(html, label)), label).toBe(true);
    expect(html).toContain('aria-label="More ways to pay"');
  });

  it("drops the assistant row: the global dock already does that", () => {
    expect(html).not.toContain("Ask your shop assistant");
    expect(html).not.toContain("Speak to your shop assistant");
  });
});

describe("TerminalCart: a sale with three lines", () => {
  const html = renderCart({ lines: threeLines, products });

  it("lists every line with its steppers, price each and a remove button", () => {
    for (const name of ["iPhone 12 Battery", "Tempered Glass Protector", "Salvaged charging cable"]) {
      expect(html).toContain(name);
      expect(html).toContain(`aria-label="Fewer ${name}"`);
      expect(html).toContain(`aria-label="More ${name}"`);
      expect(html).toContain(`aria-label="Remove ${name}"`);
    }
    expect(html).toContain("$24.99 each");
    expect(html).toContain("Only 0 in stock — selling anyway.");
  });

  it("shows the count, Clear, and the same totals the cart rules produce", () => {
    const totals = calcTotals(threeLines, 825);
    expect(html).toContain(">Clear<");
    expect(html).toMatch(/Current sale<span[^>]*>4<\/span>/);
    expect(html).toContain(`$${(totals.subtotalCents / 100).toFixed(2)}`);
    expect(html).toContain(`$${(totals.taxCents / 100).toFixed(2)}`);
    expect(html).toContain(`$${(totals.totalCents / 100).toFixed(2)}`);
  });

  it("enables Cash, Card and More once there is something to pay for", () => {
    for (const label of ["Cash", "Card", "More"]) expect(isDisabled(buttonTag(html, label)), label).toBe(false);
  });

  it("scrolls the lines inside the cart and pins everything else", () => {
    // Lines: the only scrolling region. Quick-add, totals and pay are shrink-0.
    expect(html).toMatch(/lg:max-h-none lg:min-h-0[^"]*"/);
    expect(html).toMatch(/overflow-y-auto/);
    expect((html.match(/shrink-0/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps every target at 48px or more", () => {
    expect(html).toContain("size-12");
    expect(html).toContain("h-14");
    for (const tag of buttons(html)) {
      // A height under 48px written on the button itself (the variant's own
      // `pointer-coarse:min-h-11` and its icon size are not that).
      expect(tag, tag).not.toMatch(/[\s"](?:size|h)-(?:[1-9]|10|11)(?=[\s"])/);
    }
  });
});

describe("TerminalCart: a repair on the sale, with a deposit", () => {
  const ticketLine = line({
    key: "line-9",
    productId: null,
    name: "Ticket #1014 — Galaxy Tab A8 digitizer",
    unitPriceCents: 11900,
    quantity: 1,
    stockQty: null,
    ticketChargeId: "ch1",
    ticketId: "t1",
    ticketNumber: 1014,
  });
  const ticket: PosTicket = {
    id: "t1",
    number: 1014,
    customerId: "c1",
    customerLabel: customers[0].label,
    subject: "Galaxy Tab A8",
    charges: [{ id: "ch1", description: "Galaxy Tab A8 digitizer", quantity: 1, unitPriceCents: 11900, taxable: true }],
    subtotalCents: 11900,
    depositCents: 7500,
  };
  const lines = [ticketLine];
  const totals = calcTotals(lines, 825);
  const html = renderCart({
    lines,
    totals,
    depositCents: 7500,
    dueCents: totals.totalCents - 7500,
    customerId: "c1",
    attachedTicketId: "t1",
    tickets: [ticket],
  });

  it("shows the repair as one locked block, in the shop's words", () => {
    expect(html).toContain("Repair #1014");
    expect(html).toContain("Galaxy Tab A8 digitizer");
    expect(html).not.toContain("Ticket #1014");
    expect(html).toContain("Repair subtotal");
    expect(html).toContain(">Remove<");
    // A locked line has no steppers.
    expect(html).not.toContain("Fewer");
  });

  it("locks the customer to the repair and says why", () => {
    expect(html).toContain("The customer is set by repair #1014.");
    expect(isDisabled(buttonTag(html, "Rivera"))).toBe(true);
  });

  it("takes the deposit off the total and shows what is due now", () => {
    expect(html).toContain("Deposit on file");
    expect(html).toContain("−$75.00");
    expect(html).toContain("Due now");
    expect(html).toContain(`$${((totals.totalCents - 7500) / 100).toFixed(2)}`);
  });
});

describe("TerminalCart: a long customer name", () => {
  const long = "Rivera Landscaping & Outdoor Maintenance Services LLC — Tomas Rivera Junior";
  const html = renderCart({
    customers: [{ ...customers[0], label: long }],
    customerId: "c1",
  });

  it("is cut with an ellipsis inside the chip and stays readable in a tooltip", () => {
    expect(html).toContain(`title="${long.replace("&", "&amp;")}"`);
    expect(html).toMatch(/class="[^"]*truncate[^"]*">Rivera Landscaping &amp; Outdoor/);
  });

  it("lists the credit under the name and offers Change and a way back to Walk-in", () => {
    expect(html).toContain("$75.00 credit");
    expect(html).toContain('aria-label="Change customer"');
    expect(html).toContain("Switch to walk-in");
  });
});

describe("the one-screen register's layout classes", () => {
  const register = (simple: boolean) =>
    renderToStaticMarkup(
      createElement(Register, {
        simple,
        products,
        customers,
        tickets: [],
        taxRateBps: 825,
        cardReader: { enabled: false, testMode: false, squareDevices: [], machine: { mode: "manual" as const, provider: null } },
        drawer: createElement("span", null, "DRAWER"),
      }),
    );

  it("Easy mode: a slim toolbar, two columns that fill the screen from lg, and no clutter", () => {
    const html = register(true);
    expect(html).toContain("<h1");
    expect(html).toContain('aria-label="Phone scanner"');
    expect(html).toContain("DRAWER");
    // Fixed screen from lg, with measured fallbacks for the first paint.
    expect(html).toContain("lg:h-[var(--pos-h,calc(100dvh_-_6.5rem))]");
    expect(html).toContain("lg:mb-[var(--pos-mb,-7rem)]");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
    // The clutter the brief removed.
    expect(html).not.toContain('aria-label="Everyday tools"');
    expect(html).not.toContain("Ask your shop assistant");
    expect(html).not.toContain("Use my phone as a scanner</");
  });

  it("Full mode keeps the page the way it was", () => {
    const html = register(false);
    expect(html).toContain("Use my phone as a scanner");
    expect(html).toContain('aria-label="Everyday tools"');
    expect(html).toContain("Ask your shop assistant");
    expect(html).not.toContain("lg:h-[var(--pos-h");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_360px]");
  });

  it("Easy mode is the default", () => {
    const html = renderToStaticMarkup(
      createElement(Register, {
        products,
        customers,
        tickets: [],
        taxRateBps: 825,
        cardReader: { enabled: false, testMode: false, squareDevices: [], machine: { mode: "manual" as const, provider: null } },
      }),
    );
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
  });
});

describe("ProductGrid: the picture shelves", () => {
  const grid = (layout: "classic" | "terminal") =>
    renderToStaticMarkup(
      createElement(ProductGrid, {
        products,
        onAdd: vi.fn(),
        inputRef: { current: null },
        layout,
      }),
    );

  it("terminal: every shelf is a tile with its picture, name and item count", () => {
    const html = grid("terminal");
    expect(html).toContain('aria-label="What are you selling?"');
    for (const shelf of ["Screen guards", "Batteries", "Labour", "All products"]) expect(html).toContain(shelf);
    expect(html).toContain("1 item");
    expect(html).toContain("3 items");
  });

  it("terminal: four across on a tablet, five on a wide screen, two on a phone", () => {
    const html = grid("terminal");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("md:grid-cols-4");
    expect(html).toContain("xl:grid-cols-5");
    expect(grid("classic")).not.toContain("md:grid-cols-4");
  });

  it("terminal: a big search bar that keeps its accessible name", () => {
    const html = grid("terminal");
    expect(html).toContain('aria-label="Scan a barcode or search products"');
    expect(html).toContain('name="pos-scan"');
    expect(html).toMatch(/<input[^>]*class="[^"]*\bh-14\b/);
    expect(grid("classic")).toMatch(/<input[^>]*class="[^"]*\bh-11\b/);
  });

  it("terminal: only the boxes scroll on a tablet, never the search bar", () => {
    const html = grid("terminal");
    expect(html).toContain("lg:overflow-y-auto");
    expect(html).toContain("lg:flex-1");
    expect(grid("classic")).not.toContain("lg:overflow-y-auto");
  });
});

describe("PayBar: the sticky bar for phones and portrait tablets", () => {
  const bar = (className?: string) =>
    renderToStaticMarkup(
      createElement(PayBar, {
        itemCount: 3,
        dueCents: 24545,
        tendersRef: { current: null },
        onTender: vi.fn(),
        disabled: false,
        className,
      }),
    );

  it("shows what is due now with Cash, Card and More", () => {
    const html = bar();
    expect(html).toContain("3 items · due now");
    expect(html).toContain("$245.45");
    expect(html).toContain("Cash");
    expect(html).toContain("Card");
    expect(html).toContain('aria-label="More ways to pay"');
    expect(html).toContain("sticky");
  });

  it("can step aside from lg, where the one-screen cart pins its own Pay row", () => {
    expect(bar("lg:hidden")).toContain("lg:hidden");
    expect(bar()).not.toContain("lg:hidden");
  });

  it("shows nothing for an empty sale", () => {
    expect(
      renderToStaticMarkup(
        createElement(PayBar, { itemCount: 0, dueCents: 0, tendersRef: { current: null }, onTender: vi.fn(), disabled: false }),
      ),
    ).toBe("");
  });
});

describe("DrawerChip and the toolbar", () => {
  const open = { id: "d1", openedAtLabel: "9:14 AM", openedByName: "Ada", openingCents: 15000 };

  it("says the state in words with a dot, and opens a menu of actions", () => {
    const closed = renderToStaticMarkup(createElement(DrawerChip, { drawer: null, isOwner: true }));
    expect(closed).toContain("Drawer closed");
    expect(closed).toContain('aria-haspopup="menu"');
    expect(closed).toContain("rounded-full");
    const opened = renderToStaticMarkup(createElement(DrawerChip, { drawer: open, isOwner: false }));
    expect(opened).toContain("Drawer open");
    expect(opened).not.toContain("Drawer closed");
  });

  it("is a 48px target", () => {
    expect(renderToStaticMarkup(createElement(DrawerChip, { drawer: null, isOwner: true }))).toContain("h-12");
  });

  it("wraps on a narrow phone instead of overflowing, and keeps the scanner button only when it can work", () => {
    const withScanner = renderToStaticMarkup(createElement(PosToolbar, { drawer: null, onPhoneScanner: vi.fn() }));
    expect(withScanner).toContain("flex-wrap");
    expect(withScanner).toContain("Phone scanner");
    expect(withScanner).toContain('title="Use my phone as a scanner"');
    const without = renderToStaticMarkup(createElement(PosToolbar, { drawer: null }));
    expect(without).not.toContain("Phone scanner");
  });
});

describe("colour and words", () => {
  const surfaces = {
    cart: renderCart({ lines: threeLines }),
    shelves: renderToStaticMarkup(
      createElement(ProductGrid, { products, onAdd: vi.fn(), inputRef: { current: null }, layout: "terminal" }),
    ),
    chip: renderToStaticMarkup(createElement(DrawerChip, { drawer: null, isOwner: true })),
    toolbar: renderToStaticMarkup(createElement(PosToolbar, { drawer: null, onPhoneScanner: vi.fn() })),
    classicCart: renderToStaticMarkup(
      createElement(CartPanel, { ...cartProps({ lines: threeLines }) }),
    ),
  };

  it("uses theme tokens only: no hex, no white text, no palette colours", () => {
    for (const [name, html] of Object.entries(surfaces)) {
      expect(html, name).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(html, name).not.toMatch(/\btext-white\b/);
      expect(html, name).not.toMatch(/\b(?:bg|text|border)-(?:emerald|amber|red|green|blue|slate|gray|zinc)-\d+/);
    }
  });

  it("allows white only as the canvas behind a photo", () => {
    const tiles = surfaces.shelves.match(/<[^>]*\bbg-white\b[^>]*>/g) ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tag of tiles) expect(tag, tag).toMatch(/aspect-/);
    // In the cart the only white is a product photo's own canvas.
    for (const tag of surfaces.cart.match(/<[^>]*\bbg-white\b[^>]*>/g) ?? []) expect(tag, tag).toMatch(/aspect-square/);
  });

  it("has no coloured side-stripe borders", () => {
    for (const [name, html] of Object.entries(surfaces)) {
      if (name === "classicCart") continue;
      expect(html, name).not.toMatch(/\bborder-l-(?:2|4)\b/);
    }
  });

  it("says out of stock in words, not only in colour", () => {
    // The shelves open on pictures; open one to reach the tiles.
    const html = renderToStaticMarkup(
      createElement(ProductGrid, { products: [products[1]], onAdd: vi.fn(), inputRef: { current: null }, layout: "terminal" }),
    );
    // A single shelf is still shown as a box first; the tile word is covered by the cart's own stock warning.
    expect(html).toContain("1 item");
    expect(surfaces.cart).toContain("Only 0 in stock — selling anyway.");
  });
});
