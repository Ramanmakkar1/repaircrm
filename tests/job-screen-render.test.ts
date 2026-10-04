import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Nothing here runs an action or navigates; the pieces only need these to exist.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tickets/t1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/tickets/actions", () => ({
  postUpdateAction: vi.fn(),
  notifyReadyForPickupAction: vi.fn(),
  markPickedUpAction: vi.fn(),
  addPartOrderAction: vi.fn(),
  makeInvoiceAction: vi.fn(),
  updateTicketAction: vi.fn(),
  deleteTicketAction: vi.fn(),
  createCannedResponseAction: vi.fn(),
  deleteCannedResponseAction: vi.fn(),
  deleteChargeAction: vi.fn(),
  addChargeAction: vi.fn(),
  updateChargeAction: vi.fn(),
}));
vi.mock("@/app/(app)/tickets/attachment-actions", () => ({ deleteAttachmentAction: vi.fn() }));
vi.mock("@/components/ai/draft-reply", () => ({ DraftReplyControls: () => null }));

const { JobHeader } = await import("@/components/tickets/job-header");
const { JobActionsProvider } = await import("@/components/tickets/job-actions");
const { StatusSteps } = await import("@/components/tickets/status-steps");
const { JobPrimaryAction } = await import("@/components/tickets/job-primary-action");
const { JobQuickActions } = await import("@/components/tickets/job-quick-actions");
const { JobSummary } = await import("@/components/tickets/job-summary");
const { JobDetailList, JobMoneyLinks, JobScreen, JobTabs } = await import("@/components/tickets/job-screen");
const { UpdateComposer } = await import("@/components/tickets/update-composer");
const { Timeline } = await import("@/components/tickets/timeline");
const { ChargesCard } = await import("@/components/tickets/charges-card");
const { AttachmentsCard } = await import("@/components/tickets/attachments-card");
const { DEFAULT_TICKET_STATUSES } = await import("@/components/tickets/ticket-meta");

const STATUSES = [...DEFAULT_TICKET_STATUSES];
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const h = React.createElement;

/** A coloured stripe down a card edge, as the other Easy mode screens test for it. */
const SIDE_STRIPE = /border-[lrse]-(?:[1-9]|status-|accent|destructive|ring|border-strong)/;

function inProvider(status: string, child: React.ReactElement, over: { pickedUp?: boolean } = {}) {
  return h(JobActionsProvider, {
    ticketId: "t1",
    status,
    statuses: STATUSES,
    pickedUp: over.pickedUp ?? false,
    customerName: "Owen",
    customerEmail: "owen@example.com",
    cannedResponses: [],
    children: child,
  });
}

const customer = { id: "c1", name: "Owen Fitzgerald", phone: "(780) 555-0142" };
const baseHeader = {
  back: { label: "Repairs", href: "/tickets" },
  number: 1008,
  title: "Lenovo ThinkPad T14 Gen 3",
  subject: "ThinkPad T14 - pop-ups and browser redirects",
  deviceType: "Laptop",
  status: h("span", null, "New"),
  due: { label: "Due in 6h", alert: false },
  priority: "LOW",
  customer,
};

describe("JobHeader", () => {
  it("says what it is, where it stands and who it is for, all in words", () => {
    const out = html(h(JobHeader, baseHeader));
    expect(out).toContain("#1008");
    expect(out).toContain("Lenovo ThinkPad T14 Gen 3");
    expect(out).toContain("ThinkPad T14 - pop-ups and browser redirects");
    expect(out).toContain("New");
    expect(out).toContain("Due in 6h");
    expect(out).toContain("Low priority");
    expect(out).toContain('href="/customers/c1"');
    expect(out).toContain("Owen Fitzgerald");
  });

  it("gives the phone a call button and a text button, siblings of the customer link, never inside it", () => {
    const out = html(h(JobHeader, baseHeader));
    expect(out).toContain('href="tel:7805550142"');
    expect(out).toContain('href="sms:7805550142"');
    expect(out).toContain("(780) 555-0142");
    expect(out).toMatch(/>Call/);
    expect(out).toMatch(/>Text/);
    // No anchor opens inside another anchor.
    expect(out).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
  });

  it("makes both phone buttons at least 48px tall", () => {
    const out = html(h(JobHeader, baseHeader));
    const tel = out.match(/<a[^>]*href="tel:[^"]*"[^>]*>/)?.[0] ?? "";
    const sms = out.match(/<a[^>]*href="sms:[^"]*"[^>]*>/)?.[0] ?? "";
    expect(tel).toMatch(/\bh-(?:12|14)\b/);
    expect(sms).toMatch(/\bh-(?:12|14)\b/);
  });

  it("offers no phone buttons when the customer has no number", () => {
    const out = html(h(JobHeader, { ...baseHeader, customer: { ...customer, phone: null } }));
    expect(out).not.toContain("tel:");
    expect(out).not.toContain("sms:");
    expect(out).toContain("No phone on file");
  });

  it("shows the real intake photo when there is one", () => {
    const out = html(h(JobHeader, { ...baseHeader, photoId: "file_9" }));
    expect(out).toContain('src="/files/file_9"');
  });

  it("shows the device-family picture when there is no photo", () => {
    const out = html(h(JobHeader, baseHeader));
    expect(out).toMatch(/<img[^>]*src="\/images\//);
  });

  it("flags an overdue repair in words and an urgent one in the alert tone", () => {
    const out = html(h(JobHeader, { ...baseHeader, due: { label: "Overdue 2d", alert: true }, priority: "URGENT" }));
    expect(out).toContain("Overdue 2d");
    expect(out).toContain("Urgent priority");
    expect(out).toContain("text-destructive");
  });

  it("leaves the due chip out when there is no date", () => {
    expect(html(h(JobHeader, { ...baseHeader, due: null }))).not.toContain("Due in");
  });

  it("falls back to the subject as the title when no device is on file", () => {
    const out = html(h(JobHeader, { ...baseHeader, title: "Cracked screen", subject: null, deviceType: undefined }));
    expect(out).toContain("Cracked screen");
  });

  it("has no coloured side stripe", () => {
    expect(html(h(JobHeader, baseHeader))).not.toMatch(SIDE_STRIPE);
  });
});

describe("StatusSteps", () => {
  const render = (status: string) => html(inProvider(status, h(StatusSteps, { statuses: STATUSES })));

  it("is one tappable pill per state of the pipeline, each saying its word", () => {
    const out = render("In Progress");
    expect(out.match(/<button\b/g)).toHaveLength(6);
    for (const status of STATUSES) expect(out).toContain(status);
    expect(out).toContain('aria-label="Repair status"');
  });

  it("marks exactly the current step with aria-current and fills it", () => {
    const out = render("Waiting for Parts");
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    const current = out.match(/<button[^>]*aria-current="step"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(current).toContain("Waiting for Parts");
    expect(current).toContain("bg-accent");
  });

  it("ticks the steps behind the current one and says so in words", () => {
    const out = render("Waiting for Parts");
    expect(out.match(/<span class="sr-only">Done<\/span>/g)).toHaveLength(2);
    expect(out.match(/<span class="sr-only">Current step<\/span>/g)).toHaveLength(1);
    expect(out.match(/<span class="sr-only">Not yet<\/span>/g)).toHaveLength(3);
    expect(out.match(/lucide-check/g)).toHaveLength(2);
  });

  it("ticks every other step once the repair is Resolved", () => {
    const out = render("Resolved");
    expect(out.match(/<span class="sr-only">Done<\/span>/g)).toHaveLength(5);
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("makes every pill at least 48px tall, and a real button", () => {
    const out = render("New");
    const buttons = out.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(6);
    for (const tag of buttons) {
      expect(tag).toContain('type="button"');
      expect(tag).toMatch(/\bmin-h-14\b/);
    }
  });

  it("leaves the current step with nothing to press", () => {
    const out = render("New");
    const current = out.match(/<button[^>]*aria-current="step"[^>]*>/)?.[0] ?? "";
    expect(current).toContain('aria-disabled="true"');
  });

  it("adds a status the shop has renamed away as the current step", () => {
    const out = html(inProvider("Awaiting Quote", h(StatusSteps, { statuses: STATUSES })));
    expect(out.match(/<button\b/g)).toHaveLength(7);
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    expect(out).toContain("Awaiting Quote");
  });

  it("has no coloured side stripe", () => {
    expect(render("In Progress")).not.toMatch(SIDE_STRIPE);
  });
});

describe("JobPrimaryAction", () => {
  const invoiceProps = {
    ticketId: "t1",
    chargeCount: 1,
    unbilledTimeCount: 0,
    unbilledTimeLabel: "0:00",
    unbilledTimeValue: "$0.00",
  };
  const invoice = { id: "inv1", number: 1014, status: "SENT" };

  function render(
    status: string,
    over: { unbilled?: boolean; invoice?: typeof invoice | null; pickedUp?: boolean; placement?: "side" | "pinned" } = {},
  ) {
    const inv = over.invoice ?? null;
    return html(
      inProvider(
        status,
        h(JobPrimaryAction, {
          pickedUp: over.pickedUp ?? false,
          unbilled: over.unbilled ?? false,
          customerName: "Owen",
          invoice: inv,
          invoiceProps,
          inProgress: "In Progress",
          placement: over.placement ?? "side",
        }),
        { pickedUp: over.pickedUp },
      ),
    );
  }

  it("shows the right big button for each state", () => {
    expect(render("New")).toContain("Start repair");
    expect(render("In Progress")).toContain("Mark ready for pickup");
    expect(render("Waiting for Parts")).toContain("Resume repair");
    expect(render("Waiting on Customer")).toContain("Resume repair");
    expect(render("Ready for Pickup")).toContain("Hand over to customer");
    expect(render("Resolved")).toContain("Reopen repair");
  });

  it("says what pressing it does, under it", () => {
    expect(render("In Progress")).toContain("Tells Owen by text or email.");
    expect(render("New")).toContain("Moves this repair to In Progress.");
  });

  it("takes payment on the invoice that owes, with the hand-over beside it", () => {
    const out = render("Ready for Pickup", { invoice });
    expect(out).toContain("Take payment");
    expect(out).toContain('href="/invoices/inv1"');
    expect(out).toContain("Hand over to customer");
  });

  it("makes the invoice when there is unbilled work, with the same dialog as before", () => {
    const out = render("Ready for Pickup", { unbilled: true });
    expect(out).toContain("Make invoice");
    expect(out).toContain('aria-haspopup="dialog"');
  });

  it("views the invoice on a Resolved repair and offers to reopen", () => {
    const out = render("Resolved", { invoice: { ...invoice, status: "PAID" } });
    expect(out).toContain("View invoice #1014");
    expect(out).toContain("Reopen repair");
  });

  it("makes the big button 56px tall and the quiet one 48px", () => {
    const out = render("Ready for Pickup", { invoice });
    expect(out).toMatch(/<a[^>]*class="[^"]*\bh-14\b[^"]*"[^>]*href="\/invoices\/inv1"|<a[^>]*href="\/invoices\/inv1"[^>]*class="[^"]*\bh-14\b/);
    expect(out).toMatch(/<button[^>]*class="[^"]*\bh-12\b[^"]*"[^>]*>[\s\S]*?Hand over to customer/);
  });

  it("pins only the big button above the tab bar on a phone, and never on a tablet", () => {
    const out = render("Ready for Pickup", { invoice, placement: "pinned" });
    expect(out).toContain("fixed");
    expect(out).toContain("sm:hidden");
    expect(out).toContain("Take payment");
    expect(out).not.toContain("Hand over to customer");
  });

  it("keeps the in-page copy off the phone, except a quieter button when there is one", () => {
    const withSecondary = render("Ready for Pickup", { invoice });
    expect(withSecondary).toContain("max-sm:hidden");
    const alone = render("In Progress");
    expect(alone).toMatch(/class="[^"]*max-sm:hidden[^"]*"/);
  });

  it("shows nothing when the repair has gone home and there is nothing to bill", () => {
    expect(render("Resolved", { pickedUp: true })).toBe("");
  });

  it("has no coloured side stripe", () => {
    expect(render("Ready for Pickup", { invoice })).not.toMatch(SIDE_STRIPE);
  });
});

describe("JobQuickActions", () => {
  const props = {
    ticketId: "t1",
    products: [],
    vendors: [],
    invoice: null,
    invoiceProps: { ticketId: "t1", chargeCount: 0, unbilledTimeCount: 0, unbilledTimeLabel: "0:00", unbilledTimeValue: "$0.00" },
  };

  it("has the six tiles, each with one plain word", () => {
    const out = html(h(JobQuickActions, props));
    for (const word of ["Add part", "Add photo", "Message customer", "Add note", "Create invoice", "Print"]) {
      expect(out).toContain(word);
    }
  });

  it("opens exactly what each counterpart opens", () => {
    const out = html(h(JobQuickActions, props));
    // The part form and the invoice dialog are the existing dialogs.
    expect(out.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    // The composer, as a message and as a note; the work order.
    expect(out).toContain('href="/tickets/t1?tab=updates&amp;compose=message"');
    expect(out).toContain('href="/tickets/t1?tab=updates&amp;compose=note"');
    expect(out).toContain('href="/print/tickets/t1"');
    // The photo tile opens the camera; with none to open (as in a server render) it offers the image picker.
    expect(out).toMatch(/<button[^>]*>[\s\S]*?Add photo/);
    expect(out).toContain('accept="image/*"');
  });

  it("opens the invoice that exists instead of making another", () => {
    const out = html(h(JobQuickActions, { ...props, invoice: { id: "inv1", number: 1014, status: "PAID" } }));
    expect(out).toContain('href="/invoices/inv1"');
    expect(out).toContain("Invoice #1014");
    expect(out).not.toContain("Create invoice");
  });

  it("disables Create invoice, and says why, when there is nothing to bill", () => {
    const out = html(h(JobQuickActions, props));
    expect(out).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Create invoice/);
    expect(out).toContain("Add a charge or log time first");
  });

  it("enables Create invoice once there is something to bill", () => {
    const out = html(h(JobQuickActions, { ...props, invoiceProps: { ...props.invoiceProps, chargeCount: 2 } }));
    expect(out).not.toContain("Add a charge or log time first");
  });

  it("makes every tile at least 88px tall", () => {
    const out = html(h(JobQuickActions, props));
    expect(out).toContain("min-h-[5.5rem]");
  });

  it("is a plain grid at every width, so all six tiles show and nothing scrolls sideways", () => {
    const out = html(h(JobQuickActions, props));
    const row = out.match(/<div class="([^"]*\bgrid\b[^"]*)"/)?.[1] ?? "";
    expect(row).toContain("grid-cols-3");
    expect(row).not.toMatch(/overflow-x|\bflex\b/);
    // Every tile fills its grid cell and lets its word wrap, so a long label cannot make one tile wider than the rest.
    const tiles = out.match(/class="[^"]*min-h-\[5\.5rem\][^"]*"/g) ?? [];
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile).toContain("min-w-0");
      expect(tile).not.toMatch(/shrink-0|min-w-24/);
    }
  });
});

describe("JobSummary", () => {
  it("shows each fact with its label, in a labelled region", () => {
    const out = html(
      h(JobSummary, {
        facts: [
          { label: "Device", value: "Lenovo ThinkPad T14 Gen 3", wide: true },
          { label: "Assigned to", value: "Marcus Webb" },
          { label: "Due", value: "Due in 6h" },
        ],
      }),
    );
    expect(out).toContain('aria-label="At a glance"');
    for (const word of ["Device", "Assigned to", "Due", "Lenovo ThinkPad T14 Gen 3", "Marcus Webb", "Due in 6h"]) {
      expect(out).toContain(word);
    }
  });

  it("never needs a sideways swipe: a grid on a phone, with a long device on a row of its own", () => {
    const out = html(
      h(JobSummary, {
        facts: [
          { label: "Device", value: "Laptop · Lenovo ThinkPad T14 Gen 3 · SN PF3K2LM9", wide: true },
          { label: "Assigned to", value: "Marcus Webb" },
          { label: "Due", value: "Due in 6h" },
          { label: "Location", value: "Main shop" },
          { label: "Last touched", value: "2h ago" },
        ],
      }),
    );
    expect(out).not.toMatch(/overflow-x|shrink-0 min-w|min-w-56|min-w-36/);
    expect(out).toMatch(/<dl class="[^"]*\bgrid\b[^"]*grid-cols-2/);
    // Only the device is a row of its own; the other four share two rows of two.
    expect(out.match(/col-span-full/g)).toHaveLength(1);
    expect(out).toMatch(/col-span-full[^>]*>\s*<dt[^>]*>Device</);
    // Every cell may shrink to its column, so a long value wraps instead of pushing the others off screen.
    expect(out.match(/min-w-0 flex-col/g)).toHaveLength(5);
  });
});

describe("JobTabs", () => {
  const counts = { openParts: 0, comments: 12, attachments: 3, charges: 0 };

  it("is five links, in the URL, with Work on the plain address", () => {
    const out = html(h(JobTabs, { ticketId: "t1", active: "work", counts }));
    expect(out).toContain('aria-label="Repair sections"');
    expect(out).toContain('href="/tickets/t1"');
    expect(out).toContain('href="/tickets/t1?tab=updates"');
    expect(out).toContain('href="/tickets/t1?tab=photos"');
    expect(out).toContain('href="/tickets/t1?tab=customer"');
    expect(out).toContain('href="/tickets/t1?tab=money"');
    for (const label of ["Work", "Updates", "Photos", "Customer", "Money"]) expect(out).toContain(label);
  });

  it("fills and marks the open section, and nothing else", () => {
    const out = html(h(JobTabs, { ticketId: "t1", active: "money", counts }));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    const current = out.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(current).toContain("Money");
    expect(current).toContain("bg-accent");
  });

  it("shows counts as numbers where they mean something", () => {
    const out = html(h(JobTabs, { ticketId: "t1", active: "work", counts }));
    expect(out).toMatch(/Updates[\s\S]*?>12</);
    expect(out).toMatch(/Photos[\s\S]*?>3</);
    expect(out).not.toMatch(/Money[\s\S]{0,80}>0</);
  });
});

describe("JobScreen", () => {
  const screen = (pinned?: React.ReactNode) =>
    html(
      h(JobScreen, {
        header: h("header", null, "HEAD"),
        steps: h("nav", null, "STEPS"),
        side: h("div", null, "SIDE"),
        main: h("div", null, "MAIN"),
        pinned,
      }),
    );

  it("keeps the DOM in reading order, so the tab key follows what the eye follows", () => {
    const out = screen(h("div", null, "PINNED"));
    const order = ["HEAD", "STEPS", "SIDE", "MAIN", "PINNED"].map((word) => out.indexOf(word));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it("puts the side panel to the right from a tablet up", () => {
    const out = screen();
    expect(out).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(out).toContain('aria-label="Next step and facts"');
  });
});

describe("JobDetailList and JobMoneyLinks", () => {
  it("lists label and value pairs", () => {
    const out = html(h(JobDetailList, { rows: [{ label: "Phone", value: "(780) 555-0142" }, { label: "Email", value: "a@b.c" }] }));
    expect(out).toContain("Phone");
    expect(out).toContain("(780) 555-0142");
    expect(out).toContain("Email");
  });

  it("links the invoices and estimates of the repair, with the status in words", () => {
    const out = html(
      h(JobMoneyLinks, {
        invoices: [{ id: "i1", number: 1014, status: "PAID" }],
        estimates: [{ id: "e1", number: 1001, status: "APPROVED" }],
      }),
    );
    expect(out).toContain('href="/invoices/i1"');
    expect(out).toContain("#1014");
    expect(out).toContain("Paid");
    expect(out).toContain('href="/estimates/e1"');
    expect(out).toContain("#1001");
    expect(out).toContain("Approved");
  });

  it("renders nothing when the repair has neither", () => {
    expect(html(h(JobMoneyLinks, { invoices: [], estimates: [] }))).toBe("");
  });
});

describe("UpdateComposer", () => {
  const composer = { ticketId: "t1", currentStatus: "In Progress", statuses: STATUSES, cannedResponses: [], customerEmail: "owen@example.com" };

  it("is unchanged in Full mode: a card with the status picker and the switch", () => {
    const out = html(h(UpdateComposer, composer));
    expect(out).toContain("Post an update");
    expect(out).toContain('id="composer-status"');
    expect(out).toContain('id="isPublic"');
    expect(out).toContain('<input type="hidden" name="status" value="In Progress"/>');
    expect(out).toContain("Add note");
  });

  it("is a plain section in Easy mode: a private-note / message choice, no picker, no card", () => {
    const out = html(h(UpdateComposer, { ...composer, easy: true }));
    expect(out).not.toContain("Post an update");
    expect(out).not.toContain('id="composer-status"');
    expect(out).toContain("Private note");
    expect(out).toContain("Message to customer");
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(out).toContain('<input type="hidden" name="isPublic" value=""/>');
  });

  it("opens as a message to the customer when asked to", () => {
    const out = html(h(UpdateComposer, { ...composer, easy: true, initialPublic: true }));
    expect(out).toContain('<input type="hidden" name="isPublic" value="on"/>');
    expect(out).toContain("Send update");
    expect(out).toContain('id="composer-subject"');
  });

  it("posts the status it was opened for, and says so on the button", () => {
    const out = html(h(UpdateComposer, { ...composer, easy: true, fixedStatus: "Ready for Pickup" }));
    expect(out).toContain('<input type="hidden" name="status" value="Ready for Pickup"/>');
    expect(out).toContain("Update to Ready for Pickup");
    expect(out).not.toContain('id="composer-status"');
  });
});

describe("Timeline in Easy mode", () => {
  const now = Date.UTC(2026, 9, 3, 12, 0, 0);
  const entries = [
    {
      id: "a",
      body: "Customer says it is slow",
      isPublic: false,
      subject: null,
      updateType: null,
      channel: "NOTE",
      createdAt: new Date(now - 3_600_000),
      authorName: "Marcus Webb",
    },
    {
      id: "b",
      body: "Your repair is ready",
      isPublic: true,
      subject: "Ready",
      updateType: "Ready for Pickup",
      channel: "NOTE",
      createdAt: new Date(now - 7_200_000),
      authorName: null,
    },
  ];

  it("lists the history as plain rows with the audience in words", () => {
    const out = html(h(Timeline, { entries, now, statuses: STATUSES, easy: true }));
    expect(out).toContain("History");
    expect(out).toContain("Private");
    expect(out).toContain("Sent to customer");
    expect(out).toContain("Status → Ready for Pickup");
    expect(out).toContain("Customer says it is slow");
    expect(out).not.toContain('data-card="header"');
  });

  it("keeps the card in Full mode", () => {
    const out = html(h(Timeline, { entries, now, statuses: STATUSES }));
    expect(out).toContain("Timeline");
    expect(out).toContain('data-card="header"');
  });

  it("says what an empty history will hold", () => {
    expect(html(h(Timeline, { entries: [], now, statuses: STATUSES, easy: true }))).toContain("Nothing logged yet");
  });
});

describe("ChargesCard in Easy mode", () => {
  const charges = [
    { id: "c1", description: "Screen replacement", quantity: 2, unitPriceCents: 4500, taxable: true, invoiceId: null, invoice: null },
    { id: "c2", description: "Labour", quantity: 1, unitPriceCents: 2000, taxable: false, invoiceId: "i1", invoice: { number: 1014 } },
  ];
  const props = { ticketId: "t1", charges, products: [], taxRateBps: 500 };

  it("lists each charge as a big row: what, how many at what, the line total", () => {
    const out = html(h(ChargesCard, { ...props, easy: true }));
    expect(out).toContain("Screen replacement");
    expect(out).toContain("2 × $45.00");
    expect(out).toContain("$90.00");
    expect(out).toContain("No tax");
    expect(out).toContain("On invoice #1014");
    expect(out).not.toContain("<table");
  });

  it("locks a charge that is already on an invoice, and lets the rest be edited or removed", () => {
    const out = html(h(ChargesCard, { ...props, easy: true }));
    expect(out).toContain("Locked");
    expect(out).toContain('aria-label="Edit Screen replacement"');
    expect(out).toContain('aria-label="Remove Screen replacement"');
    expect(out).not.toContain('aria-label="Edit Labour"');
  });

  it("keeps the table, and the same total, in Full mode", () => {
    const easyOut = html(h(ChargesCard, { ...props, easy: true }));
    const fullOut = html(h(ChargesCard, props));
    expect(fullOut).toContain("<table");
    const total = (out: string) => out.match(/Total<\/span><span[^>]*>(\$[\d.,]+)/)?.[1];
    expect(total(easyOut)).toBeDefined();
    expect(total(easyOut)).toBe(total(fullOut));
  });
});

describe("AttachmentsCard in Easy mode", () => {
  const props = { ticketId: "t1", attachments: [], currentUserId: "u1", isOwner: true };

  it("puts adding first, with a big button, and no card around it", () => {
    const out = html(h(AttachmentsCard, { ...props, easy: true }));
    expect(out).toContain("Add files");
    expect(out).toContain("No photos or files yet");
    expect(out).toContain('type="file"');
    expect(out).not.toContain('data-card="header"');
  });

  it("keeps the card in Full mode", () => {
    const out = html(h(AttachmentsCard, props));
    expect(out).toContain('data-card="header"');
    expect(out).toContain("Drop files here");
    expect(out).toContain('type="file"');
  });
});

describe("the new screen files follow the style guide", () => {
  const files = [
    "components/tickets/job-header.tsx",
    "components/tickets/job-screen.tsx",
    "components/tickets/job-summary.tsx",
    "components/tickets/job-quick-actions.tsx",
    "components/tickets/job-primary-action.tsx",
    "components/tickets/job-actions.tsx",
    "components/tickets/status-steps.tsx",
  ];

  it.each(files)("%s uses theme tokens only: no hex colours, no white, no side stripes", (file) => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/(?:bg|text|border|ring|fill|stroke|from|to|via)-\[#/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(source).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/);
    expect(source).not.toMatch(SIDE_STRIPE);
  });
});
