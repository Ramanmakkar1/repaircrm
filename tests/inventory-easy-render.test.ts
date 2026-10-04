import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * First paint of the Easy-mode stock and purchasing cards. What matters is
 * decidable from the markup: a card is one link, the +/- and Edit controls sit
 * BESIDE it (a button may not live inside a link), status always carries its
 * word, and the one next step on a purchase order is the only black button.
 */

// The cards only need the actions to exist; nothing here ever runs one.
vi.mock("@/app/(app)/inventory/actions", () => ({ adjustStockAction: vi.fn() }));
vi.mock("@/app/(app)/inventory/vendors/actions", () => ({
  createVendorAction: vi.fn(),
  updateVendorAction: vi.fn(),
  setVendorActiveAction: vi.fn(),
}));
vi.mock("@/app/(app)/inventory/purchase-orders/actions", () => ({
  cancelPurchaseOrderAction: vi.fn(),
  emailPurchaseOrderAction: vi.fn(),
  markPurchaseOrderedAction: vi.fn(),
  receivePurchaseOrderAction: vi.fn(),
}));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { StockCard } = await import("@/components/inventory/stock-card");
const { StockGroupTiles, groupTiles } = await import("@/components/inventory/stock-group-tiles");
const { PurchaseOrderCard } = await import("@/components/inventory/purchase-order-card");
const { VendorEasyCard } = await import("@/components/inventory/vendor-easy-card");
const { PurchaseOrderHeader } = await import("@/components/inventory/purchase-order-header");
const { PurchaseOrderActions } = await import("@/components/inventory/purchase-order-actions");
const { ListSearch } = await import("@/components/inventory/list-search");
const { inventoryGroups } = await import("@/lib/inventory/groups");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

/** Every <a> ... </a> in the markup, so we can look inside links. */
const links = (markup: string) => [...markup.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);

const product = {
  id: "p1",
  name: "Silicone Case — iPhone 14 Pro",
  sku: "ACC-CASE-IP14P",
  category: "Accessories",
  priceCents: 3499,
  stockQty: 36,
  lowStockAt: 5,
  active: true,
  serialized: false,
  imageUrl: null,
};

describe("StockCard", () => {
  it("is one link to the product, with SKU and price as its quiet line and the count as the big number", () => {
    const markup = html(createElement(StockCard, { product }));
    const [card] = links(markup);

    expect(card).toContain('href="/inventory/p1"');
    expect(card).toContain("Silicone Case — iPhone 14 Pro");
    expect(card).toContain("ACC-CASE-IP14P · $34.99");
    expect(card).toContain(">36<");
    expect(card).toContain(">left<");
    // Healthy stock needs no flag.
    expect(markup).not.toContain(">Low<");
    expect(markup).not.toContain(">Out<");
  });

  it("keeps the minus and plus OUTSIDE the card link, each one 48px tall", () => {
    const markup = html(createElement(StockCard, { product }));

    expect(markup).toContain('aria-label="Decrease stock for Silicone Case — iPhone 14 Pro"');
    expect(markup).toContain('aria-label="Increase stock for Silicone Case — iPhone 14 Pro"');
    for (const link of links(markup)) {
      expect(link).not.toContain("<button");
      expect(link).not.toContain("Decrease stock");
    }
    for (const button of markup.match(/<button\b[^>]*aria-label="(?:Decrease|Increase)[^>]*>/g) ?? []) {
      expect(button).toContain("h-12");
    }
  });

  it("says Low or Out in words under the number", () => {
    const low = html(createElement(StockCard, { product: { ...product, stockQty: 2 } }));
    expect(low).toContain(">Low<");
    expect(low).toContain(">2<");

    const out = html(createElement(StockCard, { product: { ...product, stockQty: 0 } }));
    expect(out).toContain(">Out<");
    expect(out).toContain(">0<");
  });

  it("shows no stock flag on an inactive product, and says Inactive instead", () => {
    const markup = html(createElement(StockCard, { product: { ...product, stockQty: 0, active: false } }));
    expect(markup).toContain(">Inactive<");
    expect(markup).not.toContain(">Out<");
  });

  it("does not shout '0 left' for a service that is not counted", () => {
    const markup = html(createElement(StockCard, { product: { ...product, name: "Bench Diagnostic", stockQty: 0, lowStockAt: null } }));
    expect(markup).toContain("not counted");
    expect(markup).not.toContain(">0<");
    expect(markup).not.toContain(">Out<");
  });

  it("gives a serialized product 'Manage units' instead of +/-, because a count cannot say which unit left", () => {
    const markup = html(createElement(StockCard, { product: { ...product, serialized: true } }));
    expect(markup).toContain("Manage units");
    expect(markup).not.toContain("Decrease stock");
    expect(markup).not.toContain("Increase stock");
  });
});

describe("stock group boxes", () => {
  const groups = inventoryGroups([
    { id: "a", name: "iPhone 12 Battery", category: "Parts", stockQty: 14 },
    { id: "b", name: "Tempered Glass Screen Protector", category: "Accessories", stockQty: 48 },
    { id: "c", name: "Bench Diagnostic", category: "Labour", stockQty: 0 },
    { id: "d", name: "Odd thing", category: null, stockQty: 3 },
  ]);
  const tiles = groupTiles(groups, { quantity: 65, productIds: ["a", "b", "c", "d"] }, (key) => `/inventory?group=${encodeURIComponent(key)}`);

  it("puts All products first, then every group, each with a picture and a count", () => {
    expect(tiles[0]).toMatchObject({ key: "all", title: "All products", detail: "65 in stock · 4 items" });
    expect(tiles.map((tile) => tile.key)).toEqual(["all", ...groups.map((group) => group.key)]);
    for (const tile of tiles) {
      expect(tile.photo).toMatch(/^\/images\/(products|home)\/.+\.webp$/);
    }
  });

  it("falls back to the parts-organiser picture for a shelf with no picture of its own", () => {
    const labour = tiles.find((tile) => tile.title === "Labour");
    const other = tiles.find((tile) => tile.title === "Other items");
    expect(labour?.photo).toBeTruthy();
    expect(other?.photo).toBe("/images/home/parts-bin.webp");
  });

  it("renders the same picture boxes as Home, each one a link that opens that group", () => {
    const markup = html(createElement(StockGroupTiles, { tiles }));
    expect(markup).toContain('aria-label="Inventory groups"');
    expect(markup).toContain('href="/inventory?group=all"');
    expect(markup).toContain('href="/inventory?group=batteries"');
    expect(markup).toContain("Batteries");
    expect(markup).toContain("14 in stock · 1 item");
    expect(markup).toContain("min-h-44");
  });
});

describe("PurchaseOrderCard", () => {
  const base = {
    id: "po1",
    number: 1001,
    status: "ORDERED",
    shippingCents: 2400,
    createdAt: new Date("2026-09-26T12:00:00Z"),
    orderedAt: new Date("2026-09-26T12:00:00Z"),
    expectedAt: new Date("2026-10-04T12:00:00Z"),
    receivedAt: null,
    vendor: { id: "v1", name: "Meridian Component Group" },
    lines: [
      { quantity: 2, unitCostCents: 10000, receivedQty: 0 },
      { quantity: 5, unitCostCents: 9000, receivedQty: 0 },
    ],
  };

  it("is one link to the order, with the status in words and the total on the right", () => {
    const markup = html(createElement(PurchaseOrderCard, { order: base }));
    const [card] = links(markup);

    expect(card).toContain('href="/inventory/purchase-orders/po1"');
    expect(card).toContain("Order #1001");
    expect(card).toContain(">Ordered<");
    expect(card).toContain("Meridian Component Group");
    expect(card).toContain("Expected Oct 4, 2026");
    expect(card).toContain("Nothing received yet");
    // 2 x $100 + 5 x $90 + $24 shipping
    expect(card).toContain("$674.00");
  });

  it("counts what has arrived on a part-delivered order", () => {
    const partial = { ...base, status: "PARTIAL", lines: [{ quantity: 10, unitCostCents: 100, receivedQty: 4 }] };
    expect(html(createElement(PurchaseOrderCard, { order: partial }))).toContain("4 of 10 received");
  });

  it("keeps a canceled order's word, struck through", () => {
    const markup = html(createElement(PurchaseOrderCard, { order: { ...base, status: "CANCELED" } }));
    expect(markup).toContain("line-through");
    expect(markup).toContain(">Canceled<");
  });

  it("does not talk about deliveries for a draft", () => {
    const markup = html(createElement(PurchaseOrderCard, { order: { ...base, status: "DRAFT", expectedAt: null } }));
    expect(markup).toContain(">Draft<");
    expect(markup).toContain("Not ordered yet");
    expect(markup).not.toContain("received");
  });
});

describe("VendorEasyCard", () => {
  const vendor = {
    id: "v1",
    name: "Lone Star Cell Supply",
    email: "sales@lonestarcell.example",
    phone: "(713) 555-0288",
    website: null,
    accountNumber: null,
    address: null,
    notes: null,
    active: true,
    productCount: 1,
    openPoCount: 2,
  };

  it("is one link to the supplier, with Edit and Deactivate beside it, not inside it", () => {
    const markup = html(createElement(VendorEasyCard, { vendor }));
    const [card] = links(markup);

    expect(card).toContain('href="/inventory/vendors/v1"');
    expect(card).toContain("(713) 555-0288");
    expect(card).toContain("1 part");
    expect(card).toContain("2 orders open");
    expect(card).not.toContain("<button");
    expect(markup).toContain(">Edit<");
    expect(markup).toContain("Deactivate");
  });

  it("offers Reactivate and says Inactive in words for a retired supplier", () => {
    const markup = html(createElement(VendorEasyCard, { vendor: { ...vendor, active: false } }));
    expect(markup).toContain(">Inactive<");
    expect(markup).toContain("Reactivate");
    expect(markup).not.toContain("Deactivate");
  });

  it("is honest when there is no way to reach a supplier", () => {
    const markup = html(createElement(VendorEasyCard, { vendor: { ...vendor, email: null, phone: null } }));
    expect(markup).toContain("No contact details yet");
  });
});

describe("purchase order header (Easy mode)", () => {
  it("shows a big title, the status, the total and every fact, with the actions after them", () => {
    const markup = html(
      createElement(PurchaseOrderHeader, {
        back: { label: "Purchase orders", href: "/inventory/purchase-orders" },
        title: "Order #1002",
        status: createElement("span", null, "Draft"),
        subtitle: "Not sent to the vendor yet.",
        total: "$478.00",
        facts: [
          { label: "Supplier", value: "Lone Star" },
          { label: "Expected", value: "—" },
        ],
        actions: createElement("button", null, "Mark as ordered"),
      }),
    );

    expect(markup).toContain('<h1 class="text-balance text-[28px]');
    expect(markup).toContain("Order #1002");
    expect(markup).toContain("$478.00");
    expect(markup).toContain('href="/inventory/purchase-orders"');
    expect(markup).toContain("<dt");
    expect(markup).toContain("Supplier");
    expect(markup).toContain("Expected");
    expect(markup.indexOf("Mark as ordered")).toBeGreaterThan(markup.indexOf("$478.00"));
  });
});

describe("PurchaseOrderActions in Easy mode", () => {
  const lines = [{ id: "l1", description: "Part", quantity: 5, receivedQty: 0, serialized: false }];
  const render = (status: string, extra: Record<string, unknown> = {}) =>
    html(
      createElement(PurchaseOrderActions, {
        purchaseOrderId: "po1",
        status,
        lines,
        vendorEmail: "sales@vendor.example",
        expectedAt: "",
        easy: true,
        ...extra,
      }),
    );

  /** The buttons in the markup that carry the black "primary" fill, by their words. */
  const blackButtons = (markup: string) =>
    [...markup.matchAll(/<button\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)]
      .filter((match) => match[1].includes("bg-accent text-accent-foreground"))
      .map((match) => match[2].replace(/<[^>]+>/g, "").trim());

  it("makes placing the order the one black button on a draft, listed first", () => {
    const markup = render("DRAFT");
    expect(blackButtons(markup)).toEqual(["Mark as ordered"]);
    expect(markup.indexOf("Mark as ordered")).toBeLessThan(markup.indexOf("Email to supplier"));
    // Booking in a draft is allowed, but it is not the next step: still there, not black.
    expect(markup).toContain("Book in delivery");
  });

  it("makes Book in delivery the one black button, listed first, once the order is placed", () => {
    const markup = render("ORDERED");
    expect(blackButtons(markup)).toEqual(["Book in delivery"]);
    expect(markup.indexOf("Book in delivery")).toBeLessThan(markup.indexOf("Email to supplier"));
    expect(markup).not.toContain("Mark as ordered");
  });

  it("has no black button on a received order, and no way to cancel or receive it", () => {
    const markup = render("RECEIVED", { lines: [{ ...lines[0], receivedQty: 5 }] });
    expect(blackButtons(markup)).toEqual([]);
    expect(markup).not.toContain("Cancel order");
  });

  it("keeps Cancel order last, after any extra button such as Print", () => {
    const markup = render("ORDERED", { children: createElement("a", { href: "/print" }, "Print") });
    expect(markup.indexOf("Print")).toBeGreaterThan(markup.indexOf("Email to supplier"));
    expect(markup.indexOf("Cancel order")).toBeGreaterThan(markup.indexOf("Print"));
  });

  it("every button is at least 48px tall", () => {
    const buttons = render("ORDERED").match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(2);
    for (const button of buttons) expect(button).toContain("h-12");
  });

  it("leaves the dense header exactly as it was: black Receive, outline Mark Ordered, original order", () => {
    const draft = html(
      createElement(PurchaseOrderActions, { purchaseOrderId: "po1", status: "DRAFT", lines, vendorEmail: null, expectedAt: "", size: "sm" }),
    );
    expect(draft).toContain("Mark Ordered");
    expect(draft).not.toContain("Mark as ordered");
    expect(blackButtons(draft)).toEqual(["Receive"]);
    expect(draft.indexOf("Mark Ordered")).toBeLessThan(draft.indexOf("Receive"));
    expect(draft).not.toContain("h-12");
  });
});

describe("ListSearch", () => {
  it("is a 48px search box with a name for screen readers", () => {
    const markup = html(
      createElement(ListSearch, {
        path: "/inventory/vendors",
        query: "star",
        placeholder: "Search name, phone or email",
        label: "Search suppliers",
      }),
    );
    expect(markup).toContain('role="search"');
    expect(markup).toContain('aria-label="Search suppliers"');
    expect(markup).toContain('value="star"');
    expect(markup).toContain("h-12");
    // Something typed gives a clear button as big as a thumb.
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain("size-12");
  });
});
