import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/portal",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; prefetch?: boolean }) => {
    const props: Record<string, unknown> = { ...rest };
    delete props.prefetch;
    return createElement("a", { href, ...props }, children);
  },
}));
// The pads are only drawn on the step that asks for a signature.
vi.mock("react-signature-canvas", () => ({ default: () => null }));
// The forms only need their actions to exist; nothing is submitted here.
vi.mock("@/app/checkin/[slug]/actions", () => ({ submitCheckinAction: vi.fn() }));
vi.mock("@/app/portal/tickets/new/actions", () => ({ createPortalTicketAction: vi.fn() }));
vi.mock("@/app/portal/actions", () => ({ respondToEstimateAction: vi.fn(), requestPortalLinkAction: vi.fn() }));
vi.mock("@/app/(auth)/email-code/actions", () => ({ emailCodeAction: vi.fn() }));

const { RepairStages } = await import("@/components/public/repair-stages");
const { LineRows, TotalsBlock } = await import("@/components/public/line-rows");
const { PublicShell, ShopContact, LegalLinks } = await import("@/components/public/shell");
const { FriendlyScreen } = await import("@/components/public/friendly-screen");
const NotFound = (await import("@/app/not-found")).default;
const OfflinePage = (await import("@/app/offline/page")).default;
const { CheckinForm } = await import("@/app/checkin/[slug]/checkin-form");
const { NewRequestForm } = await import("@/components/portal/new-request-form");
const { EstimateDecision } = await import("@/app/portal/_components/estimate-decision");
const { HubCards } = await import("@/app/s/[slug]/hub-cards");
const { EmailCodeForm } = await import("@/app/(auth)/email-code/code-form");
const { Field } = await import("@/app/(auth)/form-parts");
const { publicShop } = await import("@/lib/portal-display");

const html = (node: ReactNode) => renderToStaticMarkup(node as never);

const shop = publicShop({
  name: "Demo Repair Shop",
  phone: "(512) 555-0142",
  address1: "1420 E 6th Street",
  city: "Austin",
  state: "TX",
  postalCode: "78702",
  timezone: "America/Chicago",
  settings: { publicHub: { hours: "Mon–Fri 9–6\nSat 10–4" } },
});

describe("repair tracker (item 1)", () => {
  it("is four customer stages and marks the current one with a word, not only colour", () => {
    const out = html(createElement(RepairStages, { stage: 2 }));
    for (const word of ["Received", "Fixing", "Ready", "Done"]) expect(out).toContain(word);
    expect(out.match(/<li/g)).toHaveLength(4);
    expect(out).toContain('aria-current="step"');
    expect(out).toContain("Now");
    // Fits a phone: a fixed four-column grid, nothing that scrolls sideways or a min-width.
    expect(out).toContain("grid-cols-4");
    expect(out).not.toMatch(/overflow-x-auto|min-w-\[/);
  });

  it("a finished repair ticks every stage and has no current step", () => {
    const out = html(createElement(RepairStages, { stage: 3 }));
    expect(out).not.toContain('aria-current="step"');
    expect(out.match(/\(done\)/g)).toHaveLength(4);
  });
});

describe("bill and quote rows (item 2)", () => {
  it("are two-line rows with the line total on the right, never a 420px table", () => {
    const out = html(
      createElement("div", null,
        createElement(LineRows, {
          lines: [
            { id: "a", description: "Screen assembly", quantity: 1, unitPriceCents: 16549 },
            { id: "b", description: "Tempered glass", quantity: 2, unitPriceCents: 1000, serial: "SN-1", warranty: "90 days" },
          ],
        }),
        createElement(TotalsBlock, { rows: [{ label: "Total", value: "$185.49", strong: true }] }),
      ),
    );
    expect(out).not.toContain("<table");
    expect(out).not.toContain("min-w-[420px]");
    expect(out).toContain("$165.49");
    expect(out).toContain("$20.00");
    expect(out).toContain("Quantity 2 at $10.00 each");
    expect(out).toContain("Serial number SN-1");
    expect(out).toContain("Warranty: 90 days");
    expect(out).not.toMatch(/>Qty<|>Rate<|>Amount</);
  });
});

describe("one public frame with the shop's contact (item 4, 11)", () => {
  it("shows the shop's mark, a Call link, directions, hours, Privacy, Terms and Powered by", () => {
    const out = html(<PublicShell shop={shop} eyebrow="Your repairs"><p>body</p></PublicShell>);
    expect(out).toContain("Demo Repair Shop");
    expect(out).toContain(">DR<"); // initials, not a grey shield
    expect(out).toContain('href="tel:5125550142"');
    expect(out).toContain("Directions");
    expect(out).toContain("google.com/maps");
    expect(out).toContain("Mon–Fri 9–6");
    expect(out).toContain('href="/privacy"');
    expect(out).toContain('href="/terms"');
    expect(out).toContain("Powered by");
  });

  it("kiosk mode leads nowhere off the page", () => {
    const out = html(<PublicShell shop={shop} kiosk homeHref="/x">body</PublicShell>);
    expect(out).not.toContain('href="/privacy"');
    expect(out).not.toContain('href="tel:');
    expect(out).not.toContain('href="/x"');
    expect(out).toContain("Powered by");
  });

  it("uses a shop logo when there is one", () => {
    const out = html(<PublicShell shop={{ ...shop, logoUrl: "/files/logo" }}>body</PublicShell>);
    expect(out).toContain('src="/files/logo"');
  });

  it("contact buttons and legal links are 48px targets", () => {
    const contact = html(createElement(ShopContact, { shop }));
    expect(contact).toContain("h-12");
    expect(html(createElement(LegalLinks))).toContain("min-h-12");
  });
});

describe("friendly dead ends (item 8)", () => {
  it("the root 404 is branded, with a picture and three ways out", () => {
    const out = html(createElement(NotFound));
    expect(out).toContain("We can&#x27;t find that page");
    expect(out).toContain("display-screen");
    expect(out).toContain('href="/portal"');
    expect(out).toContain('href="/"');
    expect(out).toContain('href="/login"');
  });

  it("the offline page says repairs (not tickets), is honest about unsent forms and has a big Try again", () => {
    const out = html(createElement(OfflinePage));
    expect(out).toContain("No internet right now");
    expect(out).not.toMatch(/ticket/i);
    expect(out).toContain("may need filling in again");
    expect(out).toContain("Try again");
    expect(out).toContain("h-14");
  });

  it("FriendlyScreen renders an icon when there is no picture", () => {
    const out = html(createElement(FriendlyScreen, { title: "T", body: "B" }));
    expect(out).toContain("<h1");
  });
});

describe("self check-in (item 5, 10)", () => {
  const props = {
    slug: "demo",
    shop,
    kinds: [
      { label: "Phone", type: "Phone", photo: "/images/products/phone.webp" },
      { label: "Laptop", type: "Laptop", photo: "/images/products/laptop.webp" },
      { label: "Other", type: "Other", photo: null },
    ],
    problemTypes: ["Screen Repair", "Battery Replacement"],
    problemPictures: {},
    terms: "By signing below you authorise diagnosis.",
    fields: { make: true, model: true, serial: true, unlockCode: true },
    kiosk: false,
    hubLive: true,
  };

  it("opens on step 1 of 4 with device picture tiles, not a long form", () => {
    const out = html(createElement(CheckinForm, props));
    expect(out).toContain("Step 1 of 4");
    expect(out).toContain("What are you leaving with us?");
    expect(out).toContain("phone.webp");
    expect(out).toContain('aria-pressed="false"');
    expect(out).not.toContain("<select");
    expect(out).not.toMatch(/Type of job|Serial \/ IMEI|>Make<|ticket/i);
    // The honeypot is still there for bots.
    expect(out).toContain('name="website"');
  });

  it("kiosk mode has no links off the page", () => {
    const out = html(createElement(CheckinForm, { ...props, kiosk: true }));
    expect(out).not.toContain('href="/privacy"');
    expect(out).not.toContain('href="/s/demo#status"');
  });
});

describe("customer repair request (item 6)", () => {
  it("asks which device with picture tiles, then one big Next", () => {
    const out = html(
      createElement(NewRequestForm, {
        shopName: "Demo Repair Shop",
        devices: [{ id: "a1", label: "Apple iPhone 14 Pro", type: "Phone", photo: "/images/products/phone.webp" }],
        kinds: [{ label: "Laptop", type: "Laptop", photo: "/images/products/laptop.webp" }],
        problemTypes: ["Screen Repair"],
        problemPictures: {},
      }),
    );
    expect(out).toContain("Which device?");
    expect(out).toContain("Apple iPhone 14 Pro");
    expect(out).toContain("Something else");
    expect(out).toContain(">Next<");
    expect(out).not.toMatch(/Type of job|<select/);
  });
});

describe("estimate answer (item 2, 7)", () => {
  it("one black Approve with the amount and a quiet No thanks; nothing green, nothing committed on the first tap", () => {
    const out = html(createElement(EstimateDecision, { estimateId: "e1", totalLabel: "$165.49" }));
    expect(out).toContain("Approve $165.49");
    expect(out).toContain("No thanks");
    expect(out).toContain("bg-accent");
    expect(out).not.toMatch(/status-resolved|bg-green|text-white/);
    // The first tap opens a confirm step; the only submit buttons live there.
    expect(out).not.toContain('type="submit"');
    expect(out).toContain("h-14");
  });
});

describe("shop page (item 6)", () => {
  it("shows picture boxes with addresses instead of accordions", () => {
    const out = html(
      createElement(HubCards, {
        slug: "demo",
        shopName: "Demo Repair Shop",
        shopPhone: "(512) 555-0142",
        checkinEnabled: true,
        cards: { status: true, booking: true, quote: false, pay: true },
        embed: false,
      }),
    );
    expect(out).toContain('href="/checkin/demo"');
    expect(out).toContain('href="#status"');
    expect(out).toContain('href="#booking"');
    expect(out).toContain('href="#pay"');
    expect(out).not.toContain('href="#quote"');
    expect(out).not.toContain("aria-expanded");
    expect(out).toContain("pickup-bag");
  });
});

describe("sign-in family (item 12)", () => {
  it("the email-code box uses theme colours (no bg-white) and 48px controls", () => {
    const out = html(createElement(EmailCodeForm, { purpose: "login" }));
    expect(out).not.toContain("bg-white");
    expect(out).toContain("h-12");
  });

  it("auth fields are 48px and password boxes can be shown", () => {
    const text = html(createElement(Field, { label: "Email", name: "email", type: "email" }));
    expect(text).toContain("h-12");
    const password = html(createElement(Field, { label: "Password", name: "password", type: "password" }));
    expect(password).toContain('type="password"');
    expect(password).toContain("Show");
    expect(password).toContain('name="password"');
  });
});
