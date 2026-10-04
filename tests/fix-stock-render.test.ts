import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * First paint of the stock and purchasing screens this package rebuilt, as
 * static markup: what a clerk reads, which buttons exist and how big they are,
 * and that every query stays in the session's shop.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const prefs = { simple: true, density: "comfortable", theme: "light", railCollapsed: false };
vi.mock("@/lib/prefs", () => ({ readUiPrefs: vi.fn(async () => prefs) }));
vi.mock("@/lib/ai", () => ({ aiEnabled: () => false, sttEnabled: () => false }));
vi.mock("@/lib/now", () => ({ requestNow: () => Date.parse("2026-10-06T18:00:00Z") }));

vi.mock("@/app/(app)/inventory/actions", () => ({
  adjustStockAction: vi.fn(),
  addSerialsAction: vi.fn(),
  setSerialStatusAction: vi.fn(),
  createProductAction: vi.fn(),
  quickAddProductAction: vi.fn(),
}));
vi.mock("@/app/(app)/inventory/voice-actions", () => ({ parseProductVoiceAction: vi.fn() }));
vi.mock("@/app/(app)/inventory/vision-actions", () => ({ identifyProductAction: vi.fn() }));
vi.mock("@/app/(app)/inventory/vendors/actions", () => ({
  createVendorAction: vi.fn(),
  updateVendorAction: vi.fn(),
  setVendorActiveAction: vi.fn(),
}));
vi.mock("@/app/(app)/inventory/purchase-orders/actions", () => ({
  cancelPurchaseOrderAction: vi.fn(),
  createPurchaseOrderAction: vi.fn(),
  emailPurchaseOrderAction: vi.fn(),
  markPurchaseOrderedAction: vi.fn(),
  orderLowStockAction: vi.fn(),
  receivePurchaseOrderAction: vi.fn(),
}));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { PurchaseOrderCard } = await import("@/components/inventory/purchase-order-card");
const { StockCard } = await import("@/components/inventory/stock-card");
const { PoBuilder } = await import("@/components/inventory/po-builder");
const { SerialsCard } = await import("@/components/inventory/serials-card");
const { ImportWizard } = await import("@/components/import/import-wizard");
const { default: InventoryPage } = await import("@/app/(app)/inventory/page");
const { default: VendorPage } = await import("@/app/(app)/inventory/vendors/[id]/page");
const { default: NewPurchaseOrderPage } = await import("@/app/(app)/inventory/purchase-orders/new/page");
const { default: LabelsPage } = await import("@/app/print/labels/[productId]/page");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
type Page = (props: unknown) => Promise<React.ReactElement>;
const renderPage = async (page: unknown, props: Record<string, unknown>) => renderToStaticMarkup(await (page as Page)(props));

beforeEach(() => {
  resetDb();
  prefs.simple = true;
  session.role = "OWNER";
  handlers["shop.findUnique"] = () => ({ timezone: "America/Edmonton" });
});

// ---------------------------------------------------------------------------

describe("purchase order card", () => {
  const order = {
    id: "po1",
    number: 1001,
    status: "ORDERED",
    shippingCents: 0,
    createdAt: new Date("2026-09-26T12:00:00Z"),
    orderedAt: new Date("2026-09-26T12:00:00Z"),
    expectedAt: new Date("2026-10-04T00:00:00Z"),
    receivedAt: null,
    vendor: { id: "v1", name: "Meridian Component Group" },
    lines: [{ quantity: 2, unitCostCents: 10000, receivedQty: 0 }],
  };

  it("wears the supplier's initials, says Late in words, and has a Book in delivery button beside the card", () => {
    const markup = html(createElement(PurchaseOrderCard, { order, todayKey: "2026-10-05", zone: "America/Edmonton" }));
    expect(markup).toContain(">MG<");
    expect(markup).toContain(">Late<");
    expect(markup).toContain('href="/inventory/purchase-orders/po1?receive=1"');
    expect(markup).toContain("Book in delivery");
    expect(markup).toMatch(/class="[^"]*h-12[^"]*"[^>]*href="\/inventory\/purchase-orders\/po1\?receive=1"|href="\/inventory\/purchase-orders\/po1\?receive=1"[^>]*class="[^"]*h-12/);
  });

  it("is not late on its own day, and a draft has nothing to book in", () => {
    expect(html(createElement(PurchaseOrderCard, { order, todayKey: "2026-10-04" }))).not.toContain(">Late<");
    const draft = html(createElement(PurchaseOrderCard, { order: { ...order, status: "DRAFT" }, todayKey: "2026-10-09" }));
    expect(draft).not.toContain("Book in");
    expect(draft).not.toContain(">Late<");
  });
});

describe("stock card", () => {
  const product = {
    id: "p1",
    name: "iPhone 12 Battery",
    sku: "BAT-12",
    category: "Parts",
    priceCents: 4999,
    stockQty: 1,
    lowStockAt: 3,
    active: true,
    serialized: false,
    imageUrl: null,
  };

  it("adds 'Order more' beside the minus and plus when it is given somewhere to order", () => {
    const markup = html(createElement(StockCard, { product, orderHref: "/inventory/purchase-orders/new?add=p1%3A5" }));
    expect(markup).toContain("Order more");
    expect(markup).toContain('href="/inventory/purchase-orders/new?add=p1%3A5"');
    expect(markup).toContain('aria-label="Increase stock for iPhone 12 Battery"');
  });

  it("gives an uncounted service no plus and minus at all", () => {
    const markup = html(createElement(StockCard, { product: { ...product, name: "Bench Diagnostic (per hour)", category: "Labour", stockQty: 0, lowStockAt: null } }));
    expect(markup).toContain("not counted");
    expect(markup).not.toContain("Increase stock");
    expect(markup).not.toContain("Decrease stock");
  });

  it("takes 'Manage units' straight to the units", () => {
    expect(html(createElement(StockCard, { product: { ...product, serialized: true } }))).toContain('href="/inventory/p1#units"');
  });
});

describe("new order screen", () => {
  const vendors = [
    { id: "v0", name: "Austin Accessory Wholesale" },
    { id: "v1", name: "Meridian Component Group" },
  ];
  const products = [
    { id: "p1", name: "MacBook Keyboard", sku: "KB", vendorSku: "MCG-KB", vendorId: "v1", costCents: 19500, stockQty: 1, lowStockAt: 3, reorderQty: null, low: true, onOrder: 0 },
    { id: "p2", name: "1TB NVMe SSD", sku: "SSD", vendorSku: null, vendorId: "v1", costCents: 7100, stockQty: 9, lowStockAt: 2, reorderQty: null, low: false, onOrder: 5 },
  ];

  /** The products as the database returns them (no derived low / onOrder). */
  const dbRows = () =>
    products.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      vendorSku: row.vendorSku,
      vendorId: row.vendorId,
      costCents: row.costCents,
      stockQty: row.stockQty,
      lowStockAt: row.lowStockAt,
      reorderQty: row.reorderQty,
      category: null,
      catalogImage: null,
      attachments: [],
    }));

  it("opens on the supplier tiles with nobody chosen", () => {
    const markup = html(createElement(PoBuilder, { vendors, products }));
    expect(markup).toContain("Who are you ordering from?");
    expect(markup).toContain("Austin Accessory Wholesale");
    expect(markup).not.toContain('aria-pressed="true"');
    expect(markup).toContain('name="vendorId" value=""');
    // One big black Place order and a quieter Save as draft, with the live total.
    expect(markup).toContain("Place order");
    expect(markup).toContain("Save as draft");
    expect(markup).toMatch(/<button[^>]*value="place"[^>]*name="intent"|<button[^>]*name="intent"[^>]*value="place"/);
    expect(markup).not.toContain("min-w-[760px]");
  });

  it("opens on the items with the pinned Running low tile when a supplier is named", () => {
    const markup = html(createElement(PoBuilder, { vendors, products, initialVendorId: "v1" }));
    expect(markup).toContain("What do you need?");
    expect(markup).toContain("Running low (1)");
    expect(markup).toContain("From Meridian Component Group (2)");
    expect(markup).toContain("Add 5");
    expect(markup).toContain("9 left · reorder at 2 · 5 on order");
  });

  it("starts with the items an 'Order more' link asked for", () => {
    const markup = html(createElement(PoBuilder, { vendors, products, initialVendorId: "v1", add: "p1:4" }));
    expect(markup).toContain("4 on the order");
    expect(markup).toContain("$780.00");
  });

  it("is the page's Easy screen, scoped to the shop; Full mode keeps the old form with no supplier picked", async () => {
    handlers["vendor.findMany"] = () => vendors;
    handlers["product.findMany"] = () => dbRows();
    handlers["purchaseOrderLine.findMany"] = () => [];
    const easy = await renderPage(NewPurchaseOrderPage, { searchParams: Promise.resolve({}) });
    expect(easy).toContain("Who are you ordering from?");
    expect(whereOf("vendor.findMany")).toEqual({ shopId: "shop_1", active: true });
    expect(whereOf("purchaseOrderLine.findMany")).toMatchObject({ purchaseOrder: { shopId: "shop_1" } });

    resetDb();
    handlers["vendor.findMany"] = () => vendors;
    handlers["product.findMany"] = () => dbRows();
    prefs.simple = false;
    const full = await renderPage(NewPurchaseOrderPage, { searchParams: Promise.resolve({}) });
    expect(full).toContain("New purchase order");
    expect(full).toContain('name="vendorId" value=""');
    expect(callsTo("purchaseOrderLine.findMany")).toHaveLength(0);
  });
});

describe("stock page restock journey", () => {
  const rows = [
    { id: "low1", name: "Running low screen", sku: "S1", upc: null, category: "Screens", catalogImage: null, priceCents: 1000, costCents: 500, stockQty: 1, lowStockAt: 3, reorderQty: null, vendorId: "v1", active: true, serialized: false, attachments: [] },
  ];
  function seed(list: typeof rows, lowCount = list.length) {
    handlers["product.findMany"] = (args) => {
      if (args.distinct) return [{ category: "Screens" }];
      return "take" in args ? list : list.map(({ id, name, category, stockQty, catalogImage }) => ({ id, name, category, stockQty, catalogImage }));
    };
    handlers["product.count"] = (args) => ((args.where as Record<string, unknown>).lowStockAt && !(args.where as Record<string, unknown>).id ? lowCount : list.length);
  }

  it("turns the low view into a shopping list: Order all low items, and Order more on each card", async () => {
    seed(rows);
    const markup = await renderPage(InventoryPage, { searchParams: Promise.resolve({ filter: "low" }) });
    expect(markup).toContain("Order all low items (1)");
    expect(markup).toContain("Order more");
    expect(markup).toContain('href="/inventory/purchase-orders/new?vendorId=v1&amp;add=low1%3A5"');
    // The way to suppliers and orders, from Stock.
    expect(markup).toContain('href="/inventory/purchase-orders"');
    expect(markup).toContain('href="/inventory/vendors"');
    expect(markup).toContain("Running low");
  });

  it("keeps purchasing away from staff who cannot open it", async () => {
    session.role = "FRONT_DESK";
    seed(rows);
    const markup = await renderPage(InventoryPage, { searchParams: Promise.resolve({ filter: "low" }) });
    expect(markup).not.toContain("Order all low items");
    expect(markup).not.toContain("Order more");
    expect(markup).not.toContain('href="/inventory/vendors"');
  });

  it("calls an empty Out of stock view good news, with a way back to everything", async () => {
    seed([], 0);
    const markup = await renderPage(InventoryPage, { searchParams: Promise.resolve({ filter: "out" }) });
    expect(markup).toContain("Nothing is out of stock");
    expect(markup).toContain("See all stock");
    expect(markup).not.toContain("Nothing matches those filters");
  });

  it("keeps one button in the header: Import moves to the foot of the page", async () => {
    seed(rows);
    const markup = await renderPage(InventoryPage, { searchParams: Promise.resolve({}) });
    expect(markup).toContain("Import it");
    expect(markup.indexOf('href="/inventory/import"')).toBeGreaterThan(markup.indexOf('aria-label="Inventory groups"'));
  });
});

describe("supplier page in Easy mode", () => {
  function seedVendor() {
    handlers["vendor.findFirst"] = () => ({
      id: "v1",
      name: "Meridian Component Group",
      email: "sales@meridiancomponent.example",
      phone: "(512) 555-0199",
      website: "meridian.example",
      accountNumber: "MCG-88431",
      address: "1 Way",
      notes: null,
      active: true,
      createdAt: new Date("2026-01-02T12:00:00Z"),
    });
    handlers["product.findMany"] = () => [
      { id: "p1", name: "MacBook Keyboard", sku: "KB", vendorSku: "MCG-KB", costCents: 19500, stockQty: 1, lowStockAt: 3, reorderQty: null, vendorId: "v1", active: true, category: null, catalogImage: null, attachments: [] },
    ];
    handlers["purchaseOrder.findMany"] = () => [
      { id: "po1", number: 1001, status: "ORDERED", shippingCents: 0, createdAt: new Date("2026-09-26T12:00:00Z"), orderedAt: null, expectedAt: null, receivedAt: null, lines: [{ quantity: 1, unitCostCents: 100, receivedQty: 0 }] },
    ];
  }

  it("is cards and big buttons, says supplier, and nothing is a table", async () => {
    seedVendor();
    const markup = await renderPage(VendorPage, { params: Promise.resolve({ id: "v1" }) });
    expect(markup).not.toContain("<table");
    expect(markup).toContain("New order");
    expect(markup).toContain('href="tel:5125550199"');
    expect(markup).toContain('href="mailto:sales@meridiancomponent.example"');
    expect(markup).toContain("Their part number: MCG-KB");
    expect(markup).toContain("Order more");
    expect(markup).toContain("Order #1001");
    expect(markup).not.toMatch(/>Vendor/);
    expect(whereOf("vendor.findFirst")).toEqual({ id: "v1", shopId: "shop_1" });
    expect(whereOf("product.findMany")).toEqual({ shopId: "shop_1", vendorId: "v1" });
  });

  it("keeps the dense tables in Full mode, with the grammar fixed for one order", async () => {
    prefs.simple = false;
    seedVendor();
    const markup = await renderPage(VendorPage, { params: Promise.resolve({ id: "v1" }) });
    expect(markup).toContain("<table");
    expect(markup).toContain("The one order with Meridian Component Group so far.");
    expect(markup).toContain("xl:grid-cols-3");
  });
});

describe("serial numbers", () => {
  it("shows units as cards with status words, who bought it, and visible moves", () => {
    const markup = html(
      createElement(SerialsCard, {
        productId: "p1",
        serials: [
          { id: "s1", serial: "SN-1", status: "IN_STOCK", receivedLabel: "Oct 2, 2026 · 9:00 AM", soldLabel: null, notes: null, invoice: null },
          { id: "s2", serial: "SN-2", status: "SOLD", receivedLabel: "Oct 1, 2026 · 9:00 AM", soldLabel: "Oct 3, 2026 · 2:00 PM", notes: null, invoice: { id: "i1", number: 1008 }, soldTo: "Priscilla A." },
          { id: "s3", serial: "SN-3", status: "DEFECTIVE", receivedLabel: "Oct 1, 2026 · 9:00 AM", soldLabel: null, notes: null, invoice: null },
        ],
      }),
    );
    expect(markup).toContain('id="units"');
    expect(markup).toContain("1 of 3 units are in stock.");
    expect(markup).toContain(">In stock<");
    expect(markup).toContain(">Faulty<");
    expect(markup).toContain("Sold to Priscilla A.");
    expect(markup).toContain("Invoice #1008");
    expect(markup).toContain("Scan units in");
    expect(markup).toContain('aria-label="Find a serial number"');
    expect(markup).toContain("Back on the shelf");
    expect(markup).not.toContain("<table");
  });
});

describe("import wizard", () => {
  it("opens on three big choices in plain words", () => {
    const markup = html(
      createElement(ImportWizard, {
        kind: "products",
        uploadUrl: "/inventory/import/upload",
        sampleUrl: "/inventory/import/sample",
        doneHref: "/inventory",
        doneLabel: "Open stock",
        onPreview: vi.fn(),
        onCommit: vi.fn(),
      }),
    );
    expect(markup).toContain("Upload a file");
    expect(markup).toContain("Paste from Google Sheets");
    expect(markup).toContain("Download the example");
    expect(markup).toContain('href="/inventory/import/sample"');
    expect(markup).not.toContain("Map columns");
    expect(markup).not.toContain("Sample CSV");
    // Room under the last button for the floating assistant.
    expect(markup).toContain("pb-28");
  });
});

describe("shelf labels", () => {
  it("prints readable labels in the chosen size, scoped to the shop", async () => {
    handlers["product.findFirst"] = () => ({ id: "p1", name: "Silicone Case", sku: "ACC-1", upc: null, category: "Accessories", priceCents: 3499, serialized: false });
    const markup = await renderPage(LabelsPage, { params: Promise.resolve({ productId: "p1" }), searchParams: Promise.resolve({ count: "3", size: "small" }) });
    expect(whereOf("product.findFirst")).toEqual({ id: "p1", shopId: "shop_1" });
    expect(markup.match(/class="label"/g)).toHaveLength(3);
    expect(markup).toContain("label-small");
    expect(markup).toContain("$34.99");
    expect(markup).toContain("Print labels");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Small tag");
  });

  it("prints one label per unit, each with its own serial, for a serialized product", async () => {
    handlers["product.findFirst"] = () => ({ id: "p1", name: "Refurb iPhone", sku: "PH-1", upc: null, category: null, priceCents: 29900, serialized: true });
    handlers["productSerial.findMany"] = () => [
      { id: "s1", serial: "SN-1" },
      { id: "s2", serial: "SN-2" },
    ];
    const markup = await renderPage(LabelsPage, { params: Promise.resolve({ productId: "p1" }), searchParams: Promise.resolve({ units: "1" }) });
    expect(whereOf("productSerial.findMany")).toMatchObject({ shopId: "shop_1", productId: "p1", status: "IN_STOCK" });
    expect(markup.match(/class="label"/g)).toHaveLength(2);
    expect(markup).toContain("Serial SN-2");
    expect(markup).toContain("One per unit (2)");
  });
});
