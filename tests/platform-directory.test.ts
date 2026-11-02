import { describe, expect, it } from "vitest";

import {
  DIRECTORY_PAGE_SIZE,
  applyDirectoryQuery,
  directoryHref,
  latestDate,
  matchesSearch,
  parseDirectoryQuery,
  shopStatus,
  sortShops,
  summarizeShops,
  toShopRow,
  type ShopFacts,
  type ShopRow,
} from "@/lib/platform-directory";

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function facts(overrides: Partial<ShopFacts> = {}): ShopFacts {
  return {
    id: "shop_a",
    name: "Alpha Repairs",
    slug: "alpha",
    createdAt: daysAgo(90),
    currency: "usd",
    city: "Calgary",
    country: "CA",
    deletionRequestedAt: null,
    deletionPurgeAfter: null,
    owner: { name: "Dana Ortiz", email: "dana@alpha.example" },
    staff: 3,
    activeStaff: 3,
    customers: 10,
    repairs: 5,
    invoices: 4,
    products: 2,
    payments: { count: 2, cents: 5_000 },
    uploads: { count: 1, bytes: 1_000 },
    logoBytes: 500,
    database: { rows: 40, bytes: 20_000 },
    activity: [daysAgo(2)],
    ...overrides,
  };
}

function row(overrides: Partial<ShopFacts> = {}): ShopRow {
  return toShopRow(facts(overrides), NOW);
}

describe("shop status", () => {
  it("is 'being deleted' whenever the owner asked, however busy the shop is", () => {
    expect(shopStatus({ deletionRequestedAt: daysAgo(1), lastActiveAt: NOW, createdAt: daysAgo(400) }, NOW)).toBe("closing");
  });

  it("is active with activity in the last 30 days and quiet after that", () => {
    expect(shopStatus({ deletionRequestedAt: null, lastActiveAt: daysAgo(30), createdAt: daysAgo(400) }, NOW)).toBe("active");
    expect(shopStatus({ deletionRequestedAt: null, lastActiveAt: daysAgo(31), createdAt: daysAgo(400) }, NOW)).toBe("quiet");
    expect(shopStatus({ deletionRequestedAt: null, lastActiveAt: null, createdAt: daysAgo(400) }, NOW)).toBe("quiet");
  });

  it("counts signing up as activity, so a brand-new shop is not quiet", () => {
    expect(shopStatus({ deletionRequestedAt: null, lastActiveAt: null, createdAt: daysAgo(3) }, NOW)).toBe("active");
  });

  it("finds the newest of several optional dates", () => {
    expect(latestDate(null, daysAgo(5), undefined, daysAgo(1), daysAgo(9))).toEqual(daysAgo(1));
    expect(latestDate(null, undefined)).toBeNull();
    expect(latestDate(new Date("not a date"), daysAgo(2))).toEqual(daysAgo(2));
  });
});

describe("one row per shop", () => {
  it("takes the newest activity date and adds files, logo and database estimate into space used", () => {
    const shop = row({ activity: [daysAgo(10), null, daysAgo(3), daysAgo(7)] });
    expect(shop.lastActiveAt).toEqual(daysAgo(3));
    expect(shop.fileBytes).toBe(1_500);
    expect(shop.storageBytes).toBe(21_500);
    expect(shop).not.toHaveProperty("activity");
  });

  it("still counts files when the logo or the database estimate is unknown", () => {
    const shop = row({ logoBytes: null, database: null });
    expect(shop.fileBytes).toBe(1_000);
    expect(shop.storageBytes).toBe(1_000);
  });

  it("marks shops that joined in the last 30 days as new", () => {
    expect(row({ createdAt: daysAgo(29) }).isNew).toBe(true);
    expect(row({ createdAt: daysAgo(31) }).isNew).toBe(false);
  });
});

describe("reading the list's address", () => {
  it("falls back to the defaults for anything unknown", () => {
    expect(parseDirectoryQuery({})).toEqual({ q: "", show: "all", sort: "active", dir: "desc", page: 1 });
    expect(parseDirectoryQuery({ sort: "password", show: "admins", dir: "sideways", page: "-4" })).toEqual({
      q: "",
      show: "all",
      sort: "active",
      dir: "desc",
      page: 1,
    });
  });

  it("sorts names A to Z and numbers biggest first unless told otherwise", () => {
    expect(parseDirectoryQuery({ sort: "name" }).dir).toBe("asc");
    expect(parseDirectoryQuery({ sort: "storage" }).dir).toBe("desc");
    expect(parseDirectoryQuery({ sort: "storage", dir: "asc" }).dir).toBe("asc");
  });

  it("trims and caps the search, takes the first of repeated values and caps the page", () => {
    const query = parseDirectoryQuery({ q: `  ${"x".repeat(150)}  `, show: ["quiet", "closing"], page: "999999" });
    expect(query.q).toHaveLength(100);
    expect(query.show).toBe("quiet");
    expect(query.page).toBe(10_000);
  });

  it("writes short addresses that leave the defaults out", () => {
    expect(directoryHref({})).toBe("/platform/shops");
    expect(directoryHref({ q: "", show: "all", sort: "active", dir: "desc", page: 1 })).toBe("/platform/shops");
    expect(directoryHref({ sort: "name", dir: "asc" })).toBe("/platform/shops?sort=name");
    expect(directoryHref({ sort: "name", dir: "desc" })).toBe("/platform/shops?sort=name&dir=desc");
    expect(directoryHref({ q: "dana & co", show: "quiet", sort: "storage", dir: "desc", page: 2 })).toBe(
      "/platform/shops?q=dana+%26+co&show=quiet&sort=storage&page=2",
    );
  });

  it("round-trips: parsing a written address gives back the same view", () => {
    const original = { q: "calgary", show: "new" as const, sort: "repairs" as const, dir: "asc" as const, page: 3 };
    const search = new URL(directoryHref(original), "http://x").searchParams;
    expect(parseDirectoryQuery(Object.fromEntries(search))).toEqual(original);
  });
});

describe("search", () => {
  const shop = row({ name: "José's Phone Fix", city: "Montréal", owner: { name: "Ana Beltrán", email: "ana@fix.example" } });

  it("matches the shop name, owner, email, city and id, ignoring case and accents", () => {
    expect(matchesSearch(shop, "jose")).toBe(true);
    expect(matchesSearch(shop, "BELTRAN")).toBe(true);
    expect(matchesSearch(shop, "fix.example")).toBe(true);
    expect(matchesSearch(shop, "montreal")).toBe(true);
    expect(matchesSearch(shop, "shop_a")).toBe(true);
    expect(matchesSearch(shop, "edmonton")).toBe(false);
  });

  it("needs every word to match", () => {
    expect(matchesSearch(shop, "jose ana")).toBe(true);
    expect(matchesSearch(shop, "jose dana")).toBe(false);
    expect(matchesSearch(shop, "   ")).toBe(true);
  });
});

describe("sorting", () => {
  const big = row({ id: "b", name: "Bravo", database: { rows: 1, bytes: 90_000 }, activity: [daysAgo(1)] });
  const small = row({ id: "c", name: "Charlie", database: { rows: 1, bytes: 10 }, activity: [daysAgo(5)] });
  const never = row({ id: "a", name: "alpha", database: { rows: 1, bytes: 10 }, activity: [], createdAt: daysAgo(100) });

  it("puts the biggest user of space first", () => {
    expect(sortShops([small, never, big], "storage", "desc").map((shop) => shop.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks ties by name, not by whatever order the database returned", () => {
    expect(sortShops([small, never], "storage", "desc").map((shop) => shop.name)).toEqual(["alpha", "Charlie"]);
  });

  it("keeps never-active shops last in both directions", () => {
    expect(sortShops([never, small, big], "active", "desc").map((shop) => shop.id)).toEqual(["b", "c", "a"]);
    expect(sortShops([never, small, big], "active", "asc").map((shop) => shop.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts names without regard to case", () => {
    expect(sortShops([small, big, never], "name", "asc").map((shop) => shop.name)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("does not reorder the list it was given", () => {
    const list = [small, big];
    sortShops(list, "storage", "desc");
    expect(list.map((shop) => shop.id)).toEqual(["c", "b"]);
  });
});

describe("a page of the list", () => {
  it("counts every filter for the current search, then filters and sorts", () => {
    const rows = [
      row({ id: "1", name: "North Fix", activity: [daysAgo(1)] }),
      row({ id: "2", name: "North Quiet", activity: [daysAgo(90)], createdAt: daysAgo(200) }),
      row({ id: "3", name: "North Closing", deletionRequestedAt: daysAgo(1) }),
      row({ id: "4", name: "South Fix", activity: [daysAgo(1)], createdAt: daysAgo(2) }),
    ];
    const view = applyDirectoryQuery(rows, parseDirectoryQuery({ q: "north", show: "quiet" }));
    expect(view.filterCounts).toEqual({ all: 3, active: 1, quiet: 1, closing: 1, new: 0 });
    expect(view.rows.map((shop) => shop.id)).toEqual(["2"]);
    expect(view.matching).toBe(1);
  });

  it("pages long lists and keeps an out-of-range page on the last one", () => {
    const rows = Array.from({ length: DIRECTORY_PAGE_SIZE + 5 }, (_, index) =>
      row({ id: `s${index}`, name: `Shop ${String(index).padStart(3, "0")}` }),
    );
    const second = applyDirectoryQuery(rows, parseDirectoryQuery({ sort: "name", page: "2" }));
    expect(second.pages).toBe(2);
    expect(second.rows).toHaveLength(5);
    expect(second.rows[0].name).toBe(`Shop ${DIRECTORY_PAGE_SIZE}`);
    expect(applyDirectoryQuery(rows, parseDirectoryQuery({ page: "50" })).page).toBe(2);
    expect(applyDirectoryQuery([], parseDirectoryQuery({})).pages).toBe(1);
  });
});

describe("platform totals", () => {
  it("adds up every shop, keeping each currency's payments apart", () => {
    const totals = summarizeShops(
      [
        row({ id: "1", currency: "usd", payments: { count: 2, cents: 5_000 }, createdAt: daysAgo(3) }),
        row({ id: "2", currency: "cad", payments: { count: 1, cents: 9_000 }, createdAt: daysAgo(20), activeStaff: 1, staff: 2 }),
        row({ id: "3", currency: "USD", payments: { count: 1, cents: 1_000 }, deletionRequestedAt: daysAgo(1) }),
        row({ id: "4", currency: "eur", payments: { count: 0, cents: 0 }, activity: [], createdAt: daysAgo(300) }),
      ],
      NOW,
    );
    expect(totals.shops).toBe(4);
    expect(totals.byStatus).toEqual({ active: 2, quiet: 1, closing: 1 });
    expect(totals.newLast7Days).toBe(1);
    expect(totals.newLast30Days).toBe(2);
    expect(totals.staff).toBe(11);
    expect(totals.activeStaff).toBe(10);
    expect(totals.payments).toEqual([
      { currency: "CAD", count: 1, cents: 9_000 },
      { currency: "USD", count: 3, cents: 6_000 },
    ]);
    expect(totals.fileBytes).toBe(4 * 1_500);
    expect(totals.databaseBytes).toBe(4 * 20_000);
    expect(totals.storageBytes).toBe(totals.fileBytes + totals.databaseBytes);
  });

  it("is all zeros for an empty platform", () => {
    const totals = summarizeShops([], NOW);
    expect(totals.shops).toBe(0);
    expect(totals.payments).toEqual([]);
    expect(totals.storageBytes).toBe(0);
  });
});
