import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A picture chosen on purpose (Product.catalogImage) has to travel from the database row to every
 * picture on screen, or the name matcher quietly wins again. ProductImage is stubbed so these tests
 * only decide ONE thing: what each screen hands to it.
 */

vi.mock("@/components/inventory/product-image", () => ({
  ProductImage: (props: { name: string; catalogImage?: string | null }) =>
    createElement("span", { "data-picture": props.name, "data-catalog": props.catalogImage ?? "none" }),
}));
vi.mock("@/app/(app)/inventory/actions", () => ({ adjustStockAction: vi.fn() }));
vi.mock("@/app/(app)/pos/actions", () => ({
  checkoutAction: vi.fn(),
  posSquareTerminalCheckoutAction: vi.fn(),
  posTerminalIntentAction: vi.fn(),
}));
vi.mock("@/app/(app)/pos/drawers/actions", () => ({ openDrawerAction: vi.fn(), closeDrawerAction: vi.fn(), getDrawerSummaryAction: vi.fn() }));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { StockCard } = await import("@/components/inventory/stock-card");
const { TerminalCart } = await import("@/components/pos/terminal-cart");
const { CartPanel } = await import("@/components/pos/cart-panel");
const { ProductGrid } = await import("@/components/pos/product-grid");
const { calcTotals } = await import("@/lib/money");
const { catalogEntryByKey, bestCatalogMatch } = await import("@/lib/catalog/match");

import type { CartLine, PosProduct } from "@/components/pos/types";

// A name the matcher cannot place: only a deliberate choice can give it a picture.
const NAME = "Zorblax XJ-9 whatsit";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const picture = (markup: string, name = NAME) => markup.match(new RegExp(`<span data-picture="${name}" data-catalog="([^"]*)"`))?.[1];

describe("the test product", () => {
  it("really has no picture by name alone", () => {
    expect(bestCatalogMatch({ name: NAME })).toBeNull();
  });
});

describe("Stock list card", () => {
  const stock = { id: "p1", name: NAME, sku: "ZX-1", category: null, priceCents: 999, stockQty: 4, lowStockAt: 2, active: true, serialized: false, imageUrl: null };

  it("hands the chosen picture to the product picture", () => {
    expect(picture(html(createElement(StockCard, { product: { ...stock, catalogImage: "wall-charger" } })))).toBe("wall-charger");
  });

  it("hands nothing when the product is automatic (null) or the field is missing", () => {
    expect(picture(html(createElement(StockCard, { product: { ...stock, catalogImage: null } })))).toBe("none");
    expect(picture(html(createElement(StockCard, { product: stock })))).toBe("none");
  });
});

const posProduct = (over: Partial<PosProduct> = {}): PosProduct => ({
  id: "p1",
  name: NAME,
  priceCents: 999,
  taxable: true,
  stockQty: 4,
  sku: "ZX-1",
  upc: null,
  category: "Zorblax shelf",
  imageUrl: null,
  lowStockAt: 2,
  serialized: false,
  serials: [],
  ...over,
});
const line: CartLine = { key: "line-0", productId: "p1", name: NAME, unitPriceCents: 999, taxable: true, quantity: 1, stockQty: 4 };

function cartProps(products: PosProduct[]) {
  const totals = calcTotals([line], 825);
  return {
    lines: [line],
    products,
    totals,
    taxRateBps: 825,
    depositCents: 0,
    dueCents: totals.totalCents,
    customers: [],
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
  };
}

describe("Sell: the cart lines", () => {
  it("the one-screen cart shows the chosen picture", () => {
    expect(picture(html(createElement(TerminalCart, cartProps([posProduct({ catalogImage: "wall-charger" })]))))).toBe("wall-charger");
    expect(picture(html(createElement(TerminalCart, cartProps([posProduct()]))))).toBe("none");
  });

  it("the classic cart shows the chosen picture", () => {
    expect(picture(html(createElement(CartPanel, cartProps([posProduct({ catalogImage: "wall-charger" })]))))).toBe("wall-charger");
    expect(picture(html(createElement(CartPanel, cartProps([posProduct({ catalogImage: null })]))))).toBe("none");
  });
});

describe("Sell: the shelf boxes", () => {
  const grid = (products: PosProduct[], layout: "classic" | "terminal") =>
    html(createElement(ProductGrid, { products, onAdd: vi.fn(), inputRef: { current: null }, layout }));
  const PARTS_BIN = "/images/home/parts-bin.webp";

  it("a shelf with no picture of its own borrows the chosen picture of its first product", () => {
    const chosen = catalogEntryByKey("wall-charger")!.image;
    for (const layout of ["classic", "terminal"] as const) {
      const markup = grid([posProduct({ catalogImage: "wall-charger" })], layout);
      expect(markup, layout).toContain(`src="${chosen}"`);
      expect(markup, layout).not.toContain(PARTS_BIN);
    }
  });

  it("falls back to the parts bin when nothing was chosen and the name matches nothing", () => {
    for (const layout of ["classic", "terminal"] as const) {
      expect(grid([posProduct()], layout), layout).toContain(`src="${PARTS_BIN}"`);
    }
  });
});
