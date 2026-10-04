import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * The Stock list page, called as the async function it is and rendered to
 * static markup — there is no browser here, but what matters is decidable from
 * the queries it issues and the words it prints.
 *
 *  - Easy-mode OVERVIEW (the group tiles, list hidden) must not run the paged
 *    count + rows nobody sees.
 *  - Easy-mode LIST must flag the items that need ordering with a word.
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

// Client components reach for the router and next/image only when they render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => createElement("img", { alt: props.alt }),
}));

const { default: InventoryPage } = await import("@/app/(app)/inventory/page");

function product(over: Record<string, unknown>) {
  return {
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
  };
}

const catalogue = [
  product({ id: "ok", name: "Plenty screen", stockQty: 10, lowStockAt: 3 }),
  product({ id: "low", name: "Running low screen", stockQty: 2, lowStockAt: 3 }),
  product({ id: "edge", name: "Exactly at point screen", stockQty: 3, lowStockAt: 3 }),
  product({ id: "out", name: "Gone screen", stockQty: 0, lowStockAt: 3 }),
  product({ id: "service", name: "Labour screen fee", stockQty: 0, lowStockAt: null }),
  product({ id: "untracked", name: "No reorder point screen", stockQty: 4, lowStockAt: null }),
];

function seed() {
  handlers["product.findMany"] = (args) => {
    if (args.distinct) return [{ category: "Screens" }];
    // The paged list asks for `take`; the group-tile read asks for the whole shelf.
    return "take" in args ? catalogue : catalogue.map(({ id, name, category, stockQty }) => ({ id, name, category, stockQty }));
  };
  handlers["product.count"] = () => catalogue.length;
}

async function render(params: Record<string, string> = {}): Promise<string> {
  const element = await InventoryPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  resetDb();
  prefs.simple = true;
  seed();
});

describe("Stock page, Easy-mode overview", () => {
  it("shows the group tiles without running the hidden list's paged queries", async () => {
    const html = await render();

    expect(html).toContain('aria-label="Inventory groups"');
    expect(html).not.toContain('aria-label="Inventory items"');

    // One findMany: the group-tile read of the whole shelf. No paged rows, no
    // category list.
    const reads = callsTo("product.findMany");
    expect(reads).toHaveLength(1);
    expect(reads[0].args).not.toHaveProperty("take");
    expect(reads[0].args).not.toHaveProperty("skip");
    expect(reads[0].args).not.toHaveProperty("distinct");

    // One count: the "Low stock" tab's number. The paged total is not counted.
    const counts = callsTo("product.count");
    expect(counts).toHaveLength(1);
    expect(counts[0].args.where).toHaveProperty("lowStockAt");
  });

  it("reads only the columns the tiles need, scoped to this shop", async () => {
    await render();

    const [read] = callsTo("product.findMany");
    expect(read.args.select).toEqual({ id: true, name: true, category: true, stockQty: true });
    expect(whereOf("product.findMany")).toMatchObject({ shopId: "shop_1", active: true });
  });
});

describe("Stock page, other views still page the list", () => {
  it("runs the paged count, rows and category list once a group is chosen", async () => {
    await render({ group: "screens" });

    const paged = callsTo("product.findMany").filter((call) => "take" in call.args);
    expect(paged).toHaveLength(1);
    expect(paged[0].args).toMatchObject({ take: 24, skip: 0 });
    expect((paged[0].args.where as { shopId: string }).shopId).toBe("shop_1");
    expect(callsTo("product.findMany").some((call) => "distinct" in call.args)).toBe(true);
    // The page total and the low-stock tab count.
    expect(callsTo("product.count")).toHaveLength(2);
  });

  it("runs them in the full (non-Easy) layout too", async () => {
    prefs.simple = false;
    const html = await render();

    expect(callsTo("product.findMany").some((call) => "take" in call.args)).toBe(true);
    expect(callsTo("product.count")).toHaveLength(2);
    expect(html).toContain("1–6 of 6 products");
  });

  it("clamps a search with no results to an empty list, not a crash", async () => {
    handlers["product.findMany"] = (args) => (args.distinct ? [] : []);
    handlers["product.count"] = () => 0;

    const html = await render({ q: "zzz" });
    expect(html).toContain("Nothing matches those filters");
  });
});

describe("Stock page, Easy-mode list flags", () => {
  /** The markup of one list row, found by the product's name. */
  function rowOf(html: string, name: string): string {
    const rows = html.split("<li ").slice(1);
    const row = rows.find((candidate) => candidate.includes(`>${name}<`));
    if (!row) throw new Error(`no row for ${name}`);
    return row;
  }

  it("prints Low and Out as words beside the quantity for items that need ordering", async () => {
    const html = await render({ group: "screens" });

    expect(rowOf(html, "Running low screen")).toContain(">Low<");
    expect(rowOf(html, "Exactly at point screen")).toContain(">Low<");
    expect(rowOf(html, "Gone screen")).toContain(">Out<");
  });

  it("flags nothing that is fine, and nothing that is not stock-tracked", async () => {
    const html = await render({ group: "screens" });

    for (const name of ["Plenty screen", "Labour screen fee", "No reorder point screen"]) {
      const row = rowOf(html, name);
      expect(row).not.toContain(">Low<");
      expect(row).not.toContain(">Out<");
    }
  });
});
