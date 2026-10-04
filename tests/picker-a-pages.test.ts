import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

/**
 * The Stock list and Sell pages load the picture a product was given on purpose and hand it on, in Easy
 * and Full mode. ProductImage is stubbed: the question here is only what each page selects and passes.
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
vi.mock("@/lib/location", () => ({ newRecordLocationId: vi.fn(async () => "loc_1") }));
vi.mock("@/lib/payments", () => ({ paymentsLive: () => false, readTerminalLocationId: () => null, stripeTestMode: () => true }));
vi.mock("@/lib/payments/square", () => ({ squareConnectionStatus: vi.fn(async () => ({ connected: false })), listSquareDevices: vi.fn(async () => []) }));
vi.mock("@/components/billing/queries", () => ({
  customerLabel: (customer: { firstName: string; lastName: string }) => `${customer.firstName} ${customer.lastName}`,
}));
vi.mock("@/components/inventory/product-image", () => ({
  ProductImage: (props: { name: string; catalogImage?: string | null }) =>
    createElement("span", { "data-picture": props.name, "data-catalog": props.catalogImage ?? "none" }),
}));
vi.mock("@/app/(app)/inventory/actions", () => ({ adjustStockAction: vi.fn(), createProductAction: vi.fn(), quickAddProductAction: vi.fn() }));
vi.mock("@/app/(app)/inventory/voice-actions", () => ({ parseProductVoiceAction: vi.fn() }));
vi.mock("@/app/(app)/inventory/vision-actions", () => ({ identifyProductAction: vi.fn() }));
vi.mock("@/app/(app)/pos/actions", () => ({ checkoutAction: vi.fn(), posSquareTerminalCheckoutAction: vi.fn(), posTerminalIntentAction: vi.fn() }));
vi.mock("@/app/(app)/pos/drawers/actions", () => ({ openDrawerAction: vi.fn(), closeDrawerAction: vi.fn(), getDrawerSummaryAction: vi.fn() }));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { default: InventoryPage } = await import("@/app/(app)/inventory/page");
const { default: PosPage } = await import("@/app/(app)/pos/page");
const { catalogEntryByKey } = await import("@/lib/catalog/match");

const NAME = "Zorblax XJ-9 whatsit";

function stockRow(over: Record<string, unknown> = {}) {
  return {
    id: "p1", name: NAME, sku: "ZX-1", upc: null, category: "Zorblax shelf", catalogImage: null,
    priceCents: 1000, costCents: 500, stockQty: 10, lowStockAt: 3, active: true, serialized: false, attachments: [],
    ...over,
  };
}

function seedStock(rows: Record<string, unknown>[]) {
  handlers["product.findMany"] = (args) => {
    if (args.distinct) return [{ category: "Zorblax shelf" }];
    return "take" in args ? rows : rows.map(({ id, name, category, stockQty }) => ({ id, name, category, stockQty }));
  };
  handlers["product.count"] = () => rows.length;
}

const renderStock = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve(params) }));
const catalogOf = (markup: string) => markup.match(new RegExp(`data-picture="${NAME}" data-catalog="([^"]*)"`))?.[1];
const pagedSelect = () => {
  const paged = callsTo("product.findMany").find((call) => "take" in call.args);
  return (paged?.args.select ?? {}) as Record<string, unknown>;
};

beforeEach(() => {
  resetDb();
  prefs.simple = true;
});

describe("Stock page", () => {
  it("loads catalogImage with the rows and gives it to the Easy-mode card", async () => {
    seedStock([stockRow({ catalogImage: "wall-charger" })]);
    const html = await renderStock({ group: "all" });
    expect(pagedSelect()).toMatchObject({ catalogImage: true });
    expect(catalogOf(html)).toBe("wall-charger");
  });

  it("gives it to the Full-mode table too", async () => {
    prefs.simple = false;
    seedStock([stockRow({ catalogImage: "wall-charger" })]);
    const html = await renderStock();
    expect(pagedSelect()).toMatchObject({ catalogImage: true });
    expect(catalogOf(html)).toBe("wall-charger");
  });

  it("an automatic product (null) hands nothing on, in both modes", async () => {
    seedStock([stockRow()]);
    expect(catalogOf(await renderStock({ group: "all" }))).toBe("none");
    prefs.simple = false;
    expect(catalogOf(await renderStock())).toBe("none");
  });
});

describe("Sell page", () => {
  function seedSell(catalogImage: string | null) {
    handlers["product.findMany"] = () => [
      {
        id: "p1", name: NAME, priceCents: 999, taxable: true, stockQty: 4, sku: "ZX-1", upc: null, category: "Zorblax shelf",
        catalogImage, lowStockAt: 2, serialized: false, attachments: [], serials: [],
      },
    ];
    handlers["customer.findMany"] = () => [];
    handlers["ticket.findMany"] = () => [];
    handlers["shop.findUnique"] = () => ({ taxRateBps: 825, settings: {} });
    handlers["taxRate.findMany"] = () => [];
    handlers["cashDrawerSession.findFirst"] = () => null;
  }
  const renderSell = async () => renderToStaticMarkup(await (PosPage as () => Promise<React.ReactElement>)());

  it("loads catalogImage with the products", async () => {
    seedSell("wall-charger");
    await renderSell();
    expect(callsTo("product.findMany")[0].args.select).toMatchObject({ catalogImage: true });
  });

  it("the shelf box shows the chosen picture in Easy and Full mode", async () => {
    const chosen = catalogEntryByKey("wall-charger")!.image;
    for (const simple of [true, false]) {
      prefs.simple = simple;
      resetDb();
      seedSell("wall-charger");
      expect(await renderSell(), `simple=${simple}`).toContain(`src="${chosen}"`);
    }
  });
});
