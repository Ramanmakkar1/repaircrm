import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * The Stock, Purchase orders, Suppliers and Purchase order pages, called as the
 * async functions they are and rendered to static markup.
 *
 *  - Easy mode (the default) is the card layout: nothing but cards, tabs with
 *    counts, one large search.
 *  - Full mode keeps the dense table / cards it always had.
 *  - Every query stays scoped to the session's shop, and the new search adds a
 *    clause to it rather than replacing the scope.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => createElement("img", { alt: props.alt }),
}));

const { default: InventoryPage } = await import("@/app/(app)/inventory/page");
const { default: PurchaseOrdersPage } = await import("@/app/(app)/inventory/purchase-orders/page");
const { default: PurchaseOrderPage } = await import("@/app/(app)/inventory/purchase-orders/[id]/page");
const { default: VendorsPage } = await import("@/app/(app)/inventory/vendors/page");

const render = async (page: unknown, params: Record<string, string> = {}) =>
  renderToStaticMarkup(await (page as (props: unknown) => Promise<React.ReactElement>)({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  resetDb();
  prefs.simple = true;
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

function seedOrders() {
  const order = (over: Record<string, unknown>) => ({
    id: "po",
    number: 1000,
    status: "ORDERED",
    shippingCents: 0,
    createdAt: new Date("2026-09-26T12:00:00Z"),
    orderedAt: new Date("2026-09-26T12:00:00Z"),
    expectedAt: new Date("2026-10-04T12:00:00Z"),
    receivedAt: null,
    vendor: { id: "v1", name: "Meridian Component Group" },
    lines: [{ quantity: 2, unitCostCents: 10000, receivedQty: 0 }],
    ...over,
  });
  handlers["purchaseOrder.findMany"] = () => [
    order({ id: "po2", number: 1002, status: "DRAFT", expectedAt: null, vendor: { id: "v2", name: "Lone Star Cell Supply" } }),
    order({ id: "po1", number: 1001 }),
  ];
  handlers["purchaseOrder.groupBy"] = () => [
    { status: "DRAFT", _count: { _all: 1 } },
    { status: "ORDERED", _count: { _all: 1 } },
    { status: "RECEIVED", _count: { _all: 4 } },
  ];
  handlers["vendor.findMany"] = () => [
    { id: "v1", name: "Meridian Component Group" },
    { id: "v2", name: "Lone Star Cell Supply" },
  ];
}

describe("Purchase orders list", () => {
  it("shows a card per order in Easy mode, with status words and no table", async () => {
    seedOrders();
    const html = await render(PurchaseOrdersPage);

    expect(html).toContain('aria-label="Purchase orders"');
    expect(html).toContain("Order #1002");
    expect(html).toContain(">Draft<");
    expect(html).toContain("Order #1001");
    expect(html).toContain(">Ordered<");
    expect(html).not.toContain("<table");
    // One primary action.
    expect(html).toContain("New order");
    expect(html).not.toContain("All inventory");
  });

  it("puts a count on every tab, Open being the three states still in play", async () => {
    seedOrders();
    const html = await render(PurchaseOrdersPage);

    const tab = (label: string) => html.match(new RegExp(`${label}<span[^>]*>(\\d+)</span>`))?.[1];
    expect(tab("Open")).toBe("2");
    expect(tab("All")).toBe("6");
    expect(tab("Draft")).toBe("1");
    expect(tab("Received")).toBe("4");
    expect(tab("Canceled")).toBe("0");
  });

  it("counts within this shop only, and within the chosen supplier and search", async () => {
    seedOrders();
    await render(PurchaseOrdersPage, { vendorId: "v2", q: "1002" });

    const [count] = callsTo("purchaseOrder.groupBy");
    expect(count.args.where).toMatchObject({ shopId: "shop_1", vendorId: "v2" });
    expect(count.args.where).toHaveProperty("OR");
    // The tab counts ignore the status view: that is what each tab would show.
    expect(count.args.where).not.toHaveProperty("status");
  });

  it("searches the supplier name and the order number, on top of the shop scope", async () => {
    seedOrders();
    const html = await render(PurchaseOrdersPage, { q: "#1002", status: "all" });

    const where = whereOf("purchaseOrder.findMany");
    expect(where.shopId).toBe("shop_1");
    expect(where.OR).toEqual([
      { vendor: { name: { contains: "#1002", mode: "insensitive" } } },
      { number: 1002 },
    ]);
    expect(where).not.toHaveProperty("status");
    expect(html).toContain('value="#1002"');
    // The tabs carry the search with them.
    expect(html).toContain("q=%231002");
  });

  it("keeps the old status and supplier filters working through the same URLs", async () => {
    seedOrders();
    await render(PurchaseOrdersPage, { status: "RECEIVED", vendorId: "v1" });
    expect(whereOf("purchaseOrder.findMany")).toMatchObject({ shopId: "shop_1", vendorId: "v1", status: "RECEIVED" });

    resetDb();
    seedOrders();
    await render(PurchaseOrdersPage);
    expect(whereOf("purchaseOrder.findMany")).toMatchObject({ shopId: "shop_1", status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } });
  });

  it("folds the supplier filter into one bar, and says which supplier is chosen", async () => {
    seedOrders();
    const all = await render(PurchaseOrdersPage);
    expect(all).toContain("Supplier: ");
    expect(all).toContain("vendorId=v1");
    expect(all).toContain("vendorId=v2");

    resetDb();
    seedOrders();
    const one = await render(PurchaseOrdersPage, { vendorId: "v2" });
    expect(one).toMatch(/Supplier: <\/span><span class="font-semibold">Lone Star Cell Supply</);
  });

  it("offers no supplier filter when there is only one supplier to pick", async () => {
    seedOrders();
    handlers["vendor.findMany"] = () => [{ id: "v1", name: "Meridian Component Group" }];
    expect(await render(PurchaseOrdersPage)).not.toContain("Supplier: ");
  });

  it("names the next action when nothing matches", async () => {
    seedOrders();
    handlers["purchaseOrder.findMany"] = () => [];
    const html = await render(PurchaseOrdersPage, { q: "zzz" });
    expect(html).toContain("Nothing matches those filters");
    expect(html).toContain("Clear filters");
  });

  it("keeps the dense table in Full mode, with no search box and no count query", async () => {
    prefs.simple = false;
    seedOrders();
    const html = await render(PurchaseOrdersPage);

    expect(html).toContain("<table");
    expect(html).toContain("#1002");
    expect(html).toContain("All inventory");
    expect(html).toContain("New Purchase Order");
    expect(html).not.toContain('role="search"');
    expect(callsTo("purchaseOrder.groupBy")).toHaveLength(0);
  });

  it("ignores a stray ?q= in Full mode rather than filtering invisibly", async () => {
    prefs.simple = false;
    seedOrders();
    await render(PurchaseOrdersPage, { q: "zzz" });
    expect(whereOf("purchaseOrder.findMany")).not.toHaveProperty("OR");
  });
});

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

function seedVendors(inactive = 1) {
  const vendor = (over: Record<string, unknown>) => ({
    id: "v",
    name: "Vendor",
    email: null,
    phone: "(512) 555-0100",
    website: null,
    accountNumber: null,
    address: null,
    notes: null,
    active: true,
    _count: { products: 3, purchaseOrders: 1 },
    ...over,
  });
  handlers["vendor.findMany"] = () => [
    vendor({ id: "v1", name: "Austin Accessory Wholesale" }),
    vendor({ id: "v2", name: "Old Depot", active: false }),
  ];
  handlers["vendor.count"] = (args) => ((args.where as { active: boolean }).active ? 4 : inactive);
}

describe("Suppliers list", () => {
  it("shows a card per supplier in Easy mode, each with Edit and Deactivate", async () => {
    seedVendors();
    const html = await render(VendorsPage, { show: "all" });

    expect(html).toContain("<h1");
    expect(html).toContain(">Suppliers<");
    expect(html).toContain("Austin Accessory Wholesale");
    expect(html).toContain('href="/inventory/vendors/v1"');
    expect(html).toContain("Deactivate");
    expect(html).toContain("Reactivate");
    expect(html).toContain(">Inactive<");
    expect(html).toContain("Add supplier");
    expect(html).toContain('role="search"');
  });

  it("offers Active / All tabs with counts once a supplier has been retired", async () => {
    seedVendors();
    const html = await render(VendorsPage);

    expect(html).toMatch(/Active<span[^>]*>4<\/span>/);
    expect(html).toMatch(/All<span[^>]*>5<\/span>/);
    expect(html).toContain('href="/inventory/vendors?show=all"');
  });

  it("shows no tabs at all while every supplier is active", async () => {
    seedVendors(0);
    expect(await render(VendorsPage)).not.toContain("Supplier views");
  });

  it("searches name, email, phone and account number, within this shop and the chosen view", async () => {
    seedVendors();
    const html = await render(VendorsPage, { q: "555", show: "all" });

    const where = whereOf("vendor.findMany");
    expect(where.shopId).toBe("shop_1");
    expect(where).not.toHaveProperty("active");
    expect((where.OR as object[]).map((clause) => Object.keys(clause)[0])).toEqual(["name", "email", "phone", "accountNumber"]);
    expect(html).toContain('value="555"');
    expect(html).toContain("q=555");
  });

  it("lists only active suppliers by default, as before", async () => {
    seedVendors();
    await render(VendorsPage);
    expect(whereOf("vendor.findMany")).toMatchObject({ shopId: "shop_1", active: true });
  });

  it("keeps the Full-mode vendor cards and tab names", async () => {
    prefs.simple = false;
    seedVendors();
    const html = await render(VendorsPage);

    expect(html).toContain(">Vendors<");
    expect(html).toContain("New Vendor");
    expect(html).toContain("Active only");
    expect(html).toContain("Include inactive");
    expect(html).not.toContain('role="search"');
  });
});

// ---------------------------------------------------------------------------
// Purchase order
// ---------------------------------------------------------------------------

function seedOrder(status: string) {
  handlers["purchaseOrder.findFirst"] = () => ({
    id: "po1",
    number: 1001,
    status,
    shippingCents: 0,
    notes: null,
    createdAt: new Date("2026-09-26T12:00:00Z"),
    orderedAt: new Date("2026-09-26T12:00:00Z"),
    expectedAt: new Date("2026-10-04T12:00:00Z"),
    receivedAt: null,
    createdBy: { name: "Ada" },
    vendor: { id: "v1", name: "Meridian Component Group", email: "sales@meridian.example", phone: null, accountNumber: "MCG-1" },
    lines: [
      {
        id: "l1",
        description: "Keyboard assembly",
        quantity: 2,
        receivedQty: 0,
        unitCostCents: 10000,
        product: { id: "p1", name: "Keyboard", sku: "KB", vendorSku: "MCG-KB", serialized: false },
      },
    ],
    partOrders: [],
  });
}

async function renderOrder() {
  const element = await (PurchaseOrderPage as unknown as (props: unknown) => Promise<React.ReactElement>)({
    params: Promise.resolve({ id: "po1" }),
  });
  return renderToStaticMarkup(element);
}

describe("Purchase order page header", () => {
  it("opens with a big title, the status in words, and Receive as the one black button", async () => {
    seedOrder("ORDERED");
    const html = await renderOrder();

    expect(html).toContain("text-[28px]");
    expect(html).toContain("Order #1001");
    expect(html).toContain(">Ordered<");
    expect(html).toContain("$200.00");
    const black = [...html.matchAll(/<button\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)]
      .filter((match) => match[1].includes("bg-accent text-accent-foreground"))
      .map((match) => match[2].replace(/<[^>]+>/g, "").trim());
    expect(black).toEqual(["Receive"]);
  });

  it("keeps every fact the dense header carried, and every section under it", async () => {
    seedOrder("ORDERED");
    const html = await renderOrder();

    for (const fact of ["Supplier", "Received", "Raised", "Placed", "Expected", "Account"]) {
      expect(html).toContain(`>${fact}<`);
    }
    expect(html).toContain("MCG-1");
    expect(html).toContain("Meridian Component Group");
    for (const section of ["Lines", "Totals"]) expect(html).toContain(`>${section}<`);
    expect(html).toContain("Keyboard assembly");
    expect(html).toContain("PO #1001");
    expect(html).toContain("/print/purchase-orders/po1");
  });

  it("makes Mark as ordered the black button on a draft", async () => {
    seedOrder("DRAFT");
    const html = await renderOrder();
    const black = [...html.matchAll(/<button\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)]
      .filter((match) => match[1].includes("bg-accent text-accent-foreground"))
      .map((match) => match[2].replace(/<[^>]+>/g, "").trim());
    expect(black).toEqual(["Mark as ordered"]);
  });

  it("keeps the dense object header in Full mode", async () => {
    prefs.simple = false;
    seedOrder("ORDERED");
    const html = await renderOrder();

    expect(html).toContain("Purchase order #1001");
    expect(html).toContain(">Vendor<");
    expect(html).not.toContain("text-[28px] font-semibold leading-tight tracking-tight");
  });

  it("is scoped to the session's shop", async () => {
    seedOrder("ORDERED");
    await renderOrder();
    expect(whereOf("purchaseOrder.findFirst")).toEqual({ id: "po1", shopId: "shop_1" });
  });
});

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

function seedStock() {
  const row = (over: Record<string, unknown>) => ({
    id: "p",
    name: "Item",
    sku: "SKU-1",
    upc: null,
    category: "Screens",
    priceCents: 1000,
    costCents: 500,
    stockQty: 10,
    lowStockAt: 3,
    active: true,
    serialized: false,
    attachments: [],
    ...over,
  });
  const catalogue = [
    row({ id: "ok", name: "Plenty screen", stockQty: 36 }),
    row({ id: "low", name: "Running low screen", stockQty: 2 }),
    row({ id: "ser", name: "Serial screen", serialized: true }),
  ];
  handlers["product.findMany"] = (args) => {
    if (args.distinct) return [{ category: "Screens" }];
    return "take" in args ? catalogue : catalogue.map(({ id, name, category, stockQty }) => ({ id, name, category, stockQty }));
  };
  handlers["product.count"] = () => catalogue.length;
}

describe("Stock page, Easy mode", () => {
  it("opens as picture boxes, with ONE primary action", async () => {
    seedStock();
    const html = await render(InventoryPage);

    expect(html).toContain('aria-label="Inventory groups"');
    expect(html).toContain("min-h-44");
    expect(html).toContain('href="/inventory?group=screens"');
    expect(html).toContain("Add product");
    expect(html).not.toContain("New Product");
    // The boxes are the whole screen: open, and nothing to "change".
    expect(html).toMatch(/<details open=""/);
  });

  it("shows a chosen group as cards with the count, the flag and the +/- strip", async () => {
    seedStock();
    const html = await render(InventoryPage, { group: "screens" });

    expect(html).toContain('aria-label="Inventory items"');
    expect(html).not.toContain("<table");
    expect(html).toContain(">36<");
    expect(html).toContain(">left<");
    expect(html).toContain(">Low<");
    expect(html).toContain('aria-label="Increase stock for Plenty screen"');
    expect(html).toContain("Manage units");
    // The shelves fold away behind one "Change group" bar, so the list is what you see first.
    expect(html).toContain("Change group");
    expect(html).not.toMatch(/<details open=""/);
  });

  it("keeps the Low view reachable and its list first", async () => {
    seedStock();
    const html = await render(InventoryPage, { filter: "low" });

    expect(html).toContain('aria-label="Inventory items"');
    expect(html).toContain("All groups");
    expect(html).not.toMatch(/<details open=""/);
    expect(html).toContain('aria-label="Stock views"');
  });

  it("pages with two big buttons and 'Page 1 of 2'", async () => {
    seedStock();
    handlers["product.count"] = () => 40;
    const html = await render(InventoryPage, { group: "screens" });

    expect(html).toContain("Page 1 of 2");
    expect(html).toContain('aria-label="Next"');
    expect(html).toContain("h-12 px-5 text-base");
  });

  it("makes the search one large field", async () => {
    seedStock();
    const html = await render(InventoryPage);
    expect(html).toContain('aria-label="Search products"');
    expect(html).toContain("h-12 rounded-xl pl-12");
  });

  it("keeps the dense table and its New Product button in Full mode", async () => {
    prefs.simple = false;
    seedStock();
    const html = await render(InventoryPage);

    expect(html).toContain("<table");
    expect(html).toContain("New Product");
    expect(html).not.toContain('aria-label="Inventory groups"');
    expect(html).not.toContain("h-12 rounded-xl pl-12");
  });
});
