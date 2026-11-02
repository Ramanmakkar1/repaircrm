import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityItem } from "@/lib/platform-activity";
import {
  applyDirectoryQuery,
  parseDirectoryQuery,
  summarizeShops,
  toShopRow,
  type ShopFacts,
} from "@/lib/platform-directory";
import type { ShopDetail } from "@/lib/platform-shops";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  directory: vi.fn(),
  detail: vi.fn(),
  activity: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/platform-admin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: vi.fn() }));
vi.mock("@/lib/platform-shops", () => ({
  readPlatformOverview: mocks.overview,
  readShopDirectory: mocks.directory,
  readShopDetail: mocks.detail,
  readActivityFeed: mocks.activity,
  recountStorage: vi.fn(),
}));

const { default: OverviewPage } = await import("@/app/platform/page");
const { default: ShopsPage } = await import("@/app/platform/shops/page");
const { default: ShopPage } = await import("@/app/platform/shops/[id]/page");
const { default: ActivityPage } = await import("@/app/platform/activity/page");

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const HOSTILE = `<img src=x onerror=alert(1)>`;
const admin = { id: "op1", name: "Ops", email: "ops@example.test" };
const storage = { countedAt: daysAgo(0), databaseSizeBytes: 14_000_000, estimateAvailable: true };

function facts(overrides: Partial<ShopFacts> = {}): ShopFacts {
  return {
    id: "s0",
    name: HOSTILE,
    slug: "evil",
    createdAt: daysAgo(10),
    currency: "usd",
    city: null,
    country: "US",
    deletionRequestedAt: null,
    deletionPurgeAfter: null,
    owner: { name: "<b>Owner</b>", email: "owner@shop.example" },
    staff: 2,
    activeStaff: 1,
    customers: 5,
    repairs: 4,
    invoices: 3,
    products: 2,
    payments: { count: 2, cents: 12_345 },
    uploads: { count: 3, bytes: 5 * 1024 * 1024 },
    logoBytes: 40_000,
    database: { rows: 100, bytes: 300_000 },
    activity: [daysAgo(1)],
    ...overrides,
  };
}

const rows = [
  toShopRow(facts(), NOW),
  toShopRow(facts({ id: "s1", name: "Quiet Corner", activity: [], createdAt: daysAgo(300), owner: null }), NOW),
  toShopRow(facts({ id: "s2", name: "Closing Down", deletionRequestedAt: daysAgo(2), deletionPurgeAfter: daysAgo(-5) }), NOW),
];

const event: ActivityItem = {
  id: "audit-a1",
  kind: "important",
  at: daysAgo(1),
  title: `Voided invoice ${HOSTILE}`,
  actor: "<i>Dana</i>",
  shop: { id: "s0", name: HOSTILE },
  href: "/platform/shops/s0",
  source: "audit",
  sourceId: "a1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue({
    admin,
    now: NOW,
    totals: summarizeShops(rows, NOW),
    last30Days: { repairs: 2, invoices: 1, signedInStaff: 1, payments: [{ currency: "USD", count: 1, cents: 5_000 }] },
    newFeedback: 3,
    biggest: [...rows].sort((a, b) => b.storageBytes - a.storageBytes),
    recent: [event],
    storage,
  });
  mocks.directory.mockImplementation(async (params: Record<string, string>) => {
    const query = parseDirectoryQuery(params);
    return { admin, now: NOW, query, totalShops: rows.length, view: applyDirectoryQuery(rows, query), storage };
  });
  mocks.activity.mockResolvedValue({ admin, now: NOW, filter: "important", isFirstPage: false, items: [event], next: "1790000000000.audit.a1" });
});

const escaped = "&lt;img src=x onerror=alert(1)&gt;";

describe("console pages", () => {
  it("shows the overview totals and keeps shop text as text", async () => {
    const html = renderToStaticMarkup(await OverviewPage());
    expect(html).toContain("Space used");
    expect(html).toContain("$370");
    expect(html).toContain("$50 in the last 30 days");
    expect(html).toContain("1 active · 1 quiet · 1 being deleted");
    expect(html).toContain(escaped);
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain("<i>Dana</i>");
    expect(html).toContain('href="/platform/shops?sort=storage"');
  });

  it("lists shops with search, filters and sort links, echoing the search safely", async () => {
    const html = renderToStaticMarkup(await ShopsPage({ searchParams: Promise.resolve({ q: '"><script>x</script>', sort: "storage" }) }));
    expect(mocks.directory).toHaveBeenCalledWith({ q: '"><script>x</script>', sort: "storage" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("No shops match this view.");

    const all = renderToStaticMarkup(await ShopsPage({ searchParams: Promise.resolve({ sort: "storage" }) }));
    expect(all).toContain(escaped);
    expect(all).not.toContain(HOSTILE);
    expect(all).toContain('aria-sort="descending"');
    expect(all).toContain('href="/platform/shops?sort=storage&amp;dir=asc"');
    expect(all).toContain("Being deleted");
    expect(all).toContain("Quiet");
    expect(all).toContain("No owner login");
  });

  it("shows one shop's space, staff and a deletion warning, with no way to change the shop", async () => {
    const shop = {
      id: "s2",
      name: HOSTILE,
      slug: "evil",
      createdAt: daysAgo(10),
      currency: "cad",
      timezone: "America/Edmonton",
      phone: null,
      email: null,
      city: "Calgary",
      state: "AB",
      country: "CA",
      logoPath: null,
      stripeOnboardedAt: null,
      deletionRequestedAt: daysAgo(2),
      deletionPurgeAfter: daysAgo(-5),
      status: "closing" as const,
      lastActiveAt: daysAgo(2),
      owner: { id: "u1", name: "Dana", email: "dana@shop.example", role: "OWNER" as const, active: false, lastLoginAt: daysAgo(3), createdAt: daysAgo(10), totpEnabledAt: null, googleLinkedAt: null },
      staff: [
        { id: "u1", name: "Dana", email: "dana@shop.example", role: "OWNER" as const, active: false, lastLoginAt: daysAgo(3), createdAt: daysAgo(10), totpEnabledAt: null, googleLinkedAt: null },
      ],
      usage: {
        customers: 5,
        repairs: 4,
        repairs30: 1,
        invoices: 3,
        invoices30: 1,
        products: 2,
        payments: { count: 2, cents: 12_345 },
        payments30: { count: 1, cents: 5_000 },
        refunds: { count: 0, cents: 0 },
        locations: 1,
        apiKeys: 0,
        integrations: [{ provider: "xero", status: "error", lastSyncAt: null }],
      },
      storage: {
        files: {
          repairs: { count: 2, bytes: 2_048 },
          customers: { count: 0, bytes: 0 },
          products: { count: 0, bytes: 0 },
          other: { count: 0, bytes: 0 },
          automaticPhotos: { count: 0, bytes: 0 },
          logoBytes: 0,
        },
        fileBytes: 2_048,
        database: { rows: 12, bytes: 9_000, tables: [{ table: "Ticket", label: "Repairs", rows: 4, bytes: 6_000 }] },
        signatureBytes: 1_024,
        totalBytes: 11_048,
      },
      activity: [event],
    } satisfies ShopDetail;
    mocks.detail.mockResolvedValue({ admin, now: NOW, shop, storage });

    const html = renderToStaticMarkup(await ShopPage({ params: Promise.resolve({ id: "s2" }) }));
    expect(mocks.detail).toHaveBeenCalledWith("s2");
    expect(html).toContain("This shop is being deleted.");
    expect(html).toContain("in 5 days");
    expect(html).toContain('href="mailto:dana@shop.example"');
    expect(html).toContain("Switched off");
    expect(html).toContain("Xero (has an error)");
    expect(html).toContain("including 1 KB of customer signatures");
    expect(html).toContain("CA$123");
    expect(html).toContain(escaped);
    expect(html).not.toContain(HOSTILE);
    // Read-only: the only form is "Count again" (plus Sign out in the frame).
    expect(html.match(/<form/g)).toHaveLength(2);
  });

  it("answers an unknown shop with Not found", async () => {
    mocks.detail.mockResolvedValue({ admin, now: NOW, shop: null });
    await expect(ShopPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("pages the activity feed with older and newest links that keep the filter", async () => {
    const html = renderToStaticMarkup(await ActivityPage({ searchParams: Promise.resolve({ show: "important", before: "x" }) }));
    expect(html).toContain('href="/platform/activity?show=important&amp;before=1790000000000.audit.a1"');
    expect(html).toContain('href="/platform/activity?show=important"');
    expect(html).toContain("Back to newest");
    expect(html).toContain(escaped);
    expect(html).not.toContain("<i>Dana</i>");
  });
});
