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
  makeInvoiceAction: vi.fn(),
  removeChargeAction: vi.fn(),
  restoreChargeAction: vi.fn(),
  addChargeAction: vi.fn(),
  updateChargeAction: vi.fn(),
  createCannedResponseAction: vi.fn(),
  deleteCannedResponseAction: vi.fn(),
}));
vi.mock("@/components/ai/draft-reply", () => ({ DraftReplyControls: () => null }));

const { JobActionsProvider } = await import("@/components/tickets/job-actions");
const { StatusSteps } = await import("@/components/tickets/status-steps");
const { JobBillLink, JobTabs } = await import("@/components/tickets/job-screen");
const { ChargesCard } = await import("@/components/tickets/charges-card");
const { JOB_TABS, inProgressTarget, jobSteps } = await import("@/components/tickets/job-screen-logic");
const { DEFAULT_TICKET_STATUSES } = await import("@/components/tickets/ticket-meta");

const STATUSES = [...DEFAULT_TICKET_STATUSES];
const h = React.createElement;
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

function inProvider(status: string, child: React.ReactElement) {
  return h(JobActionsProvider, {
    ticketId: "t1",
    status,
    statuses: STATUSES,
    pickedUp: false,
    customerName: "Owen",
    customerEmail: "owen@example.com",
    cannedResponses: [],
    children: child,
  });
}

describe("status steps: real history, not a tick on every earlier step", () => {
  it("ticks only the steps the repair went through and says Skipped for the rest", () => {
    // Booked in, then straight to Ready for Pickup.
    const steps = jobSteps(STATUSES, "Ready for Pickup", ["Ready for Pickup"]);
    expect(steps.map((step) => [step.status, step.state])).toEqual([
      ["New", "done"],
      ["In Progress", "skipped"],
      ["Waiting for Parts", "skipped"],
      ["Waiting on Customer", "skipped"],
      ["Ready for Pickup", "current"],
      ["Resolved", "todo"],
    ]);
  });

  it("counts a status from the history whatever its case, and the booking-in step always", () => {
    const steps = jobSteps(STATUSES, "Ready for Pickup", ["in progress", "Created", "Invoiced"]);
    expect(steps.slice(0, 4).map((step) => step.state)).toEqual(["done", "done", "skipped", "skipped"]);
  });

  it("keeps the old reading (every earlier step done) when no history is given", () => {
    expect(jobSteps(STATUSES, "Ready for Pickup").slice(0, 4).every((step) => step.state === "done")).toBe(true);
  });

  it("draws Skipped in words, dashed and without the tick, and Done with it", () => {
    const out = html(inProvider("Ready for Pickup", h(StatusSteps, { statuses: STATUSES, visited: ["Ready for Pickup", "In Progress"] })));
    const pill = (name: string) => out.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*?${name}(?:(?!</button>)[\\s\\S])*?</button>`))?.[0] ?? "";
    expect(pill("In Progress")).toContain("lucide-check");
    expect(pill("In Progress")).toContain(">Done<");
    expect(pill("Waiting for Parts")).not.toContain("lucide-check");
    expect(pill("Waiting for Parts")).toContain("Skipped");
    expect(pill("Waiting for Parts")).toContain("border-dashed");
    expect(out).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("Resume / Start / Reopen without an In Progress status", () => {
  const PIPELINE = ["New", "Diagnosing", "Waiting for Parts", "Repairing", "Ready for Pickup", "Resolved"];

  it("still prefers the shop's In Progress", () => {
    expect(inProgressTarget(STATUSES, "Waiting for Parts")).toBe("In Progress");
  });

  it("goes back to the first working step, not on to the next one", () => {
    // The next step after Waiting for Parts would have been Repairing; from Waiting on a later step, Ready.
    expect(inProgressTarget(PIPELINE, "Waiting for Parts")).toBe("Diagnosing");
    expect(inProgressTarget(["New", "Bench", "Waiting on Customer", "Ready for Pickup", "Resolved"], "Waiting on Customer")).toBe("Bench");
    expect(inProgressTarget(["Intake", "On hold", "Bench", "Done"], "On hold")).toBe("Bench");
    expect(inProgressTarget(PIPELINE, "Resolved")).toBe("Diagnosing");
  });

  it("falls back to the next step only when the pipeline has no working step at all", () => {
    expect(inProgressTarget(["New", "Waiting for Parts", "Ready for Pickup", "Resolved"], "New")).toBe("Waiting for Parts");
    expect(inProgressTarget(["Intake"], "Intake")).toBeNull();
  });
});

describe("the section tabs fit a counter tablet", () => {
  it("are one word each", () => {
    for (const tab of JOB_TABS) expect(tab.label).toMatch(/^[A-Z][a-z]+$/);
  });

  it("still carry their counts and link to each section", () => {
    const out = html(h(JobTabs, { ticketId: "t1", active: "money", counts: { openParts: 1, comments: 12, attachments: 3, charges: 2 } }));
    expect(out).toMatch(/Photos[\s\S]*?>3</);
    expect(out).toMatch(/Money[\s\S]*?>2</);
    expect(out).toContain('href="/tickets/t1?tab=money"');
  });
});

describe("On the bill, on a phone", () => {
  it("stacks the words and keeps the total in its own column", () => {
    const out = html(h(JobBillLink, { href: "/tickets/t1?tab=money", lines: 2, total: "$546.14" }));
    // "On the bill: 2 charges" is one run of text, not three pieces a phone can break apart.
    expect(out).toContain(">On the bill: 2 charges<");
    expect(out).toMatch(/flex-col[^"]*"><span class="text-base font-semibold">On the bill: 2 charges<\/span><span[^>]*>See Money<\/span>/);
    expect(out).toMatch(/<span class="rf-num shrink-0[^"]*">\$546\.14<\/span>/);
  });

  it("says Nothing on the bill yet, with no total, before the first charge", () => {
    const out = html(h(JobBillLink, { href: "/x", lines: 0, total: null }));
    expect(out).toContain("Nothing on the bill yet");
    expect(out).toContain("Add a charge");
    expect(out).not.toContain("rf-num");
  });
});

describe("removing a charge", () => {
  const charges = [
    { id: "ch_1", description: "Screen", quantity: 1, unitPriceCents: 12_000, taxable: true, invoiceId: null, invoice: null },
    { id: "ch_2", description: "Labour", quantity: 1, unitPriceCents: 5_000, taxable: true, invoiceId: "inv_1", invoice: { number: 1003 } },
  ];

  it("is a button (one tap, then Undo), never a bare form post, in both modes, and only for a charge not on an invoice", () => {
    for (const easy of [true, false]) {
      const out = html(h(ChargesCard, { ticketId: "t1", charges, products: [], taxRateBps: 500, easy }));
      expect(out).toContain('aria-label="Remove Screen"');
      expect(out).not.toContain('aria-label="Remove Labour"');
      expect(out).not.toMatch(/<form[^>]*>[\s\S]*?Remove Screen/);
    }
  });
});

describe("the status sheet does not start on its shortcut button", () => {
  it("focuses the sheet's title when it opens", () => {
    const source = readFileSync("components/tickets/job-actions.tsx", "utf8");
    const sheet = source.slice(source.indexOf('sheet === "status"'), source.indexOf("<UpdateComposer"));
    expect(sheet).toContain("onOpenAutoFocus");
    expect(sheet).toContain("event.preventDefault()");
    expect(sheet).toMatch(/<DialogTitle data-sheet-title tabIndex=\{-1\}/);
    // The shortcut block comes after the title, so nothing else is focused first.
    expect(sheet.indexOf("data-sheet-title")).toBeLessThan(sheet.indexOf("<ShortcutBlock"));
  });
});
