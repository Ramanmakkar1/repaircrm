import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The toolbar only needs a router to exist; it never navigates in a static render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets",
  useSearchParams: () => new URLSearchParams(),
}));

const { RepairCard } = await import("@/components/tickets/repair-card");
const { RepairPager } = await import("@/components/tickets/repair-pager");
const { RepairHeader } = await import("@/components/tickets/repair-header");
const { MoreActions } = await import("@/components/tickets/more-actions");
const { TicketCard } = await import("@/components/tickets/ticket-card");
const { LiveStatusBadge } = await import("@/components/tickets/ticket-status");
const { TicketToolbar } = await import("@/components/tickets/ticket-toolbar");

const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 3, 12, 0, 0);

const repair = {
  id: "t_1",
  number: 1008,
  subject: "ThinkPad T14 — pop-ups and browser redirects",
  status: "In Progress",
  priority: "NORMAL",
  dueDate: new Date(now - 48 * HOUR),
  customer: { firstName: "Owen", lastName: "Fitzgerald", businessName: null },
  assignedTo: { name: "Marcus Webb" },
  asset: { type: "Laptop", make: "Lenovo", model: "ThinkPad T14 Gen 3" },
};

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

// A coloured stripe down a card edge: a 2px+ side border, or a side border in a status/accent colour.
// A hairline between columns (`border-l border-border`) and `first:border-l-0` are not stripes.
const SIDE_STRIPE = /border-[lrse]-(?:[1-9]|status-|accent|destructive|ring|border-strong)/;

describe("RepairCard", () => {
  it("is one link to the repair with the title, the line, the status word and the due words", () => {
    const out = html(React.createElement(RepairCard, { repair, now }));
    expect(out).toContain('href="/tickets/t_1"');
    expect(out).toContain("#1008 · Owen Fitzgerald");
    expect(out).toContain("ThinkPad T14 — pop-ups and browser redirects");
    expect(out).toContain("In Progress");
    expect(out).toContain("Overdue 2d");
  });

  it("shows the shop's own status word, not a shortened one", () => {
    const out = html(React.createElement(RepairCard, { repair: { ...repair, status: "Waiting for Parts" }, now }));
    expect(out).toContain("Waiting for Parts");
  });

  it("has no coloured side stripe", () => {
    const out = html(React.createElement(RepairCard, { repair, now }));
    expect(out).not.toMatch(SIDE_STRIPE);
    expect(out).not.toMatch(/border-[lr]\b(?!-)/);
  });

  it("uses the intake photo when there is one, else the device-family picture", () => {
    const withPhoto = html(
      React.createElement(RepairCard, {
        repair: { ...repair, attachments: [{ id: "f_9", fileName: "receipt.png" }, { id: "f_10", fileName: "device-front.jpg" }] },
        now,
      }),
    );
    expect(withPhoto).toContain('src="/files/f_10"');

    const without = html(React.createElement(RepairCard, { repair, now }));
    expect(without).toContain("/images/products/laptop.webp");
    expect(without).not.toContain("/files/");
  });

  it("falls back to an icon when no picture fits", () => {
    const out = html(React.createElement(RepairCard, { repair: { ...repair, asset: { type: "Printer", make: null, model: null }, subject: "Paper jam" }, now }));
    expect(out).not.toContain("<img");
  });

  it("names who has it as initials, and says so when nobody does", () => {
    expect(html(React.createElement(RepairCard, { repair, now }))).toContain("Assigned to Marcus Webb");
    expect(html(React.createElement(RepairCard, { repair: { ...repair, assignedTo: null }, now }))).toContain("Unassigned");
  });

  it("folds a busy repair's facts into +N more", () => {
    const out = html(
      React.createElement(RepairCard, {
        repair: {
          ...repair,
          priority: "URGENT",
          needsReply: true,
          partOrders: [{ status: "ORDERED" }],
          depositCents: 2500,
          checklist: { done: 1, total: 4 },
        },
        now,
      }),
    );
    expect(out).toContain("Urgent");
    expect(out).toContain("Needs reply");
    expect(out).toContain("+3 more");
    expect(out).not.toContain("Deposit $25.00</span>");
  });

  it("leaves out the due chip on a resolved repair", () => {
    expect(html(React.createElement(RepairCard, { repair: { ...repair, status: "Resolved" }, now }))).not.toContain("Overdue");
  });
});

describe("RepairPager", () => {
  const props = { total: 120, from: 26, to: 50, previousHref: "/tickets?q=owen", nextHref: "/tickets?q=owen&page=3", noun: "repair" };

  it("shows Previous, where you are, and Next, and keeps the filters in both links", () => {
    const out = html(React.createElement(RepairPager, { ...props, page: 2, pageCount: 5 }));
    expect(out).toContain("Page 2 of 5");
    expect(out).toContain('href="/tickets?q=owen"');
    expect(out).toContain('href="/tickets?q=owen&amp;page=3"');
    expect(out).toContain("Previous");
    expect(out).toContain("Next");
  });

  it("disables Previous on the first page and Next on the last, but keeps both on screen", () => {
    const first = html(React.createElement(RepairPager, { ...props, page: 1, pageCount: 5 }));
    expect(first).toMatch(/<button[^>]*disabled[^>]*>[^]*Previous/);
    expect(first).not.toContain('rel="prev"');

    const last = html(React.createElement(RepairPager, { ...props, page: 5, pageCount: 5 }));
    expect(last).toMatch(/<button[^>]*disabled[^>]*>[^]*Next/);
    expect(last).not.toContain('rel="next"');
  });

  it("has nothing to turn with one page, and just says how many", () => {
    const out = html(React.createElement(RepairPager, { ...props, page: 1, pageCount: 1, total: 12 }));
    expect(out).not.toContain("Previous");
    expect(out).toContain("12 repairs");
  });
});

describe("RepairHeader", () => {
  const header = html(
    React.createElement(RepairHeader, {
      back: { label: "Repairs", href: "/tickets" },
      number: 1008,
      title: "Lenovo ThinkPad T14 Gen 3",
      status: React.createElement("span", null, "STATUS-SLOT"),
      subject: "ThinkPad T14 — pop-ups",
      customer: { id: "c_1", name: "Owen Fitzgerald", phone: "(512) 555-0189" },
      primary: React.createElement("button", null, "PRIMARY-SLOT"),
      more: React.createElement("button", null, "MORE-SLOT"),
      facts: [
        { label: "Device", value: "Lenovo" },
        { label: "Due", value: "Tomorrow" },
      ],
    }),
  );

  it("leads with a big title, the status, and the customer one tap away", () => {
    expect(header).toContain("#1008");
    expect(header).toContain("Lenovo ThinkPad T14 Gen 3");
    expect(header).toContain("STATUS-SLOT");
    expect(header).toContain('href="/customers/c_1"');
    expect(header).toContain('href="tel:5125550189"');
    expect(header).toContain("PRIMARY-SLOT");
    expect(header).toContain("MORE-SLOT");
  });

  it("keeps plain labels and no coloured side stripe", () => {
    expect(header).toContain("Device");
    expect(header).not.toContain("uppercase");
    expect(header).not.toMatch(SIDE_STRIPE);
  });

  it("leaves out the phone link when there is no number", () => {
    const out = html(
      React.createElement(RepairHeader, {
        back: { label: "Repairs", href: "/tickets" },
        number: 7,
        title: "Dell XPS 13",
        status: null,
        customer: { id: "c_2", name: "Amara Nwosu", phone: null },
        facts: [],
      }),
    );
    expect(out).not.toContain("tel:");
  });
});

describe("MoreActions", () => {
  it("keeps its actions mounted but hidden until opened, so a dialog inside survives the panel closing", () => {
    const out = html(React.createElement(MoreActions, null, React.createElement("button", null, "Edit")));
    expect(out).toContain("Edit");
    expect(out).toContain('aria-expanded="false"');
    expect(out).toMatch(/class="[^"]*\bhidden\b/);
  });
});

describe("TicketCard (Full mode)", () => {
  it("no longer paints the status down the left edge", () => {
    const out = html(
      React.createElement(TicketCard, {
        now,
        ticket: { ...repair, updatedAt: new Date(now - HOUR) },
      }),
    );
    expect(out).toContain("In Progress");
    expect(out).not.toMatch(SIDE_STRIPE);
  });
});

describe("LiveStatusBadge", () => {
  it("shows the status as written, with its dot", () => {
    const out = html(React.createElement(LiveStatusBadge, { status: "Waiting on Customer" }));
    expect(out).toContain("Waiting on Customer");
  });
});

describe("TicketToolbar", () => {
  const props = { values: { q: "", status: "open", tech: "all", problemType: "all", sort: "created", due: "all", customerId: "" }, problemTypes: [], techs: [] };

  it("says repair, and is one big search with a Filters button, in Easy mode", () => {
    const out = html(React.createElement(TicketToolbar, { ...props, simple: true }));
    expect(out).toContain('aria-label="Search repairs"');
    expect(out).toContain("Filters");
    expect(out).toContain("h-12");
  });

  it("keeps its Full mode words", () => {
    const out = html(React.createElement(TicketToolbar, props));
    expect(out).toContain('aria-label="Search tickets"');
    expect(out).toContain("Search ticket #, customer, phone or IMEI");
  });
});
