import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * The /pos page, called as the async function it is and rendered to markup.
 *
 *  - Easy mode (the default) is the one-screen register with the drawer as a
 *    small chip in the toolbar.
 *  - Full mode keeps the page and the drawer strip as they were.
 *  - Every query is still scoped to the session's shop (and the till to this
 *    branch), whichever layout is drawn.
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
vi.mock("@/lib/location", () => ({ newRecordLocationId: vi.fn(async () => "loc_1") }));
vi.mock("@/lib/payments", () => ({
  paymentsLive: () => false,
  readTerminalLocationId: () => null,
  stripeTestMode: () => true,
}));
vi.mock("@/lib/payments/square", () => ({
  squareConnectionStatus: vi.fn(async () => ({ connected: false })),
  listSquareDevices: vi.fn(async () => []),
}));
vi.mock("@/components/billing/queries", () => ({
  customerLabel: (customer: { firstName: string; lastName: string }) => `${customer.firstName} ${customer.lastName}`,
}));
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
  default: (props: { alt: string }) => createElement("img", { alt: props.alt }),
}));

const { default: PosPage } = await import("@/app/(app)/pos/page");

const render = async () => renderToStaticMarkup(await (PosPage as () => Promise<React.ReactElement>)());

function seed(drawer: unknown = null) {
  handlers["product.findMany"] = () => [
    {
      id: "p1",
      name: "Tempered Glass Protector",
      priceCents: 2499,
      taxable: true,
      stockQty: 12,
      sku: "ACC-TG",
      upc: null,
      category: "Screen guards",
      lowStockAt: 3,
      serialized: false,
      attachments: [],
      serials: [],
    },
  ];
  handlers["customer.findMany"] = () => [];
  handlers["ticket.findMany"] = () => [];
  handlers["shop.findUnique"] = () => ({ taxRateBps: 825, settings: {} });
  handlers["taxRate.findMany"] = () => [];
  handlers["cashDrawerSession.findFirst"] = () => drawer;
}

const openSession = {
  id: "d1",
  openedAt: new Date("2026-10-03T16:14:00Z"),
  openingCents: 15000,
  openedBy: { name: "Ada Lovelace" },
};

beforeEach(() => {
  resetDb();
  prefs.simple = true;
  session.role = "OWNER";
});

describe("/pos in Easy mode", () => {
  it("draws the one-screen register with the drawer as a chip in the toolbar", async () => {
    seed();
    const html = await render();

    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_380px]");
    expect(html).toContain("Drawer closed");
    expect(html).toContain('aria-haspopup="menu"');
    // The strip's sentence and button live in the full page, not here.
    expect(html).not.toContain("Open it with the float in the till before taking cash.");
    expect(html).not.toContain('aria-label="Everyday tools"');
  });

  it("says Drawer open when a till is open, and keeps the details inside the chip's menu", async () => {
    seed(openSession);
    const html = await render();

    expect(html).toContain("Drawer open");
    expect(html).not.toContain("Drawer closed");
    expect(html).not.toContain("Since ");
  });

  it("shows the shelves and the cart's prompt on first paint", async () => {
    seed();
    const html = await render();

    expect(html).toContain("What are you selling?");
    expect(html).toContain("Screen guards");
    expect(html).toContain("Nothing here yet");
  });
});

describe("/pos in Full mode", () => {
  it("keeps the header, the drawer strip and the everyday tools row", async () => {
    prefs.simple = false;
    seed();
    const html = await render();

    expect(html).toContain("Use my phone as a scanner");
    expect(html).toContain("Open it with the float in the till before taking cash.");
    expect(html).toContain("Open drawer");
    expect(html).toContain('aria-label="Everyday tools"');
    expect(html).toContain("Ask your shop assistant");
    expect(html).not.toContain("lg:h-[var(--pos-h");
  });

  it("shows who opened the till on the strip", async () => {
    prefs.simple = false;
    seed(openSession);
    const html = await render();

    expect(html).toContain("Drawer open");
    expect(html).toContain("Since ");
    expect(html).toContain("$150.00");
    expect(html).toContain("Ada Lovelace");
  });
});

describe("/pos queries", () => {
  it("stay scoped to this shop, and the till to this branch, in either layout", async () => {
    for (const simple of [true, false]) {
      resetDb();
      prefs.simple = simple;
      seed();
      await render();

      expect(whereOf("product.findMany")).toMatchObject({ shopId: "shop_1", active: true });
      expect(whereOf("customer.findMany")).toMatchObject({ shopId: "shop_1" });
      expect(whereOf("ticket.findMany")).toMatchObject({ shopId: "shop_1" });
      expect(whereOf("cashDrawerSession.findFirst")).toMatchObject({
        shopId: "shop_1",
        locationId: "loc_1",
        closedAt: null,
      });
      expect(callsTo("taxRate.findMany")[0].args.where).toMatchObject({ shopId: "shop_1" });
    }
  });
});
