import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children),
}));
vi.mock("@/app/(app)/invoices/recurring/actions", () => ({
  runRecurringInvoice: vi.fn(),
  runDueRecurringInvoices: vi.fn(),
  setScheduleActiveAction: vi.fn(),
}));

const { ColumnChart } = await import("@/components/reports/charts");
const { TicketSheet } = await import("@/components/billing/print-ticket-sheet");
const { LockedDocument, AlreadySentNotice } = await import("@/components/billing/locked-document");
const { RepeatStep } = await import("@/components/recurring/repeat-step");
const flow = await import("@/components/billing/bill/flow");
const { drawerCardWords, drawerOffSentence, drawerTakings, drawerViewCounts } = await import("@/components/pos/drawer-history");

import type { BillContext } from "@/components/billing/bill/flow";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Reports column chart", () => {
  it("gives every column the chart's full height, so the bars can grow (they were 3px slivers)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ColumnChart, {
        caption: "Money in by week",
        series: [{ key: "revenue", label: "Taken", className: "bg-accent" }],
        rows: [
          { label: "Sep 1", fullLabel: "Sep 1 – Sep 7", values: [10_000] },
          { label: "Sep 8", fullLabel: "Sep 8 – Sep 14", values: [5_000] },
        ],
        format: String,
      }),
    );
    expect(html).toContain("flex h-full min-w-0 flex-1 flex-col");
    expect(html).toContain("height:100%");
    expect(html).toContain("height:50%");
  });
});

describe("printed work order", () => {
  const base = {
    number: 1008,
    shop: { name: "Demo Repair Shop", lines: [] },
    customer: { name: "Owen Fitzgerald", lines: [] },
    meta: [{ label: "Opened", value: "Oct 3, 2026" }],
    subject: "Cracked screen",
    problemType: "Screen",
    device: { type: "Phone", make: "Apple", model: "iPhone 14", serial: "SN1", password: "1234", notes: null },
    charges: [],
    taxRateBps: 825,
    intakeSignedCaption: "Customer authorisation (intake)",
    backHref: "/tickets/t1",
    backLabel: "Back to repair #1008",
    chrome: false,
    terms: "Bring the claim check.",
  };

  it("keeps the passcode off the paper unless asked, and fits one page (compact sheet, one-line empty charges)", () => {
    const html = renderToStaticMarkup(React.createElement(TicketSheet, base));
    expect(text(html)).toContain("Passcode On file");
    expect(html).not.toContain("1234");
    expect(html).toContain("rf-sheet rf-wo");
    expect(text(html)).toContain("Nothing charged yet");
    expect(html).not.toContain("<table class=\"rf-items");
    // The claim check is still there, with its barcode.
    expect(text(html)).toContain("Claim check");
    expect(html).toContain("rf-stub-code");
    // One barcode only (the stub's), not a footer copy as well.
    expect(html.match(/rf-foot\b/g)).toBeNull();
  });

  it("prints the passcode when the page asks for it", () => {
    const html = renderToStaticMarkup(React.createElement(TicketSheet, { ...base, showPasscode: true }));
    expect(text(html)).toContain("Passcode 1234");
  });
});

describe("edit screens for a document past changing", () => {
  it("says why in words, with one big button, instead of bouncing", () => {
    const html = renderToStaticMarkup(
      React.createElement(LockedDocument, {
        title: "Invoice #1012 is paid",
        reason: "Money has been taken on it, so its items can't change.",
        action: { label: "Back to invoice #1012", href: "/invoices/inv_1" },
      }),
    );
    expect(text(html)).toContain("Invoice #1012 is paid");
    expect(html).toContain('href="/invoices/inv_1"');
    expect(html).toContain("h-14");
  });

  it("warns calmly that a sent document needs its new copy sent", () => {
    const html = renderToStaticMarkup(React.createElement(AlreadySentNotice, { customerName: "Elena Marquez", noun: "invoice" }));
    expect(text(html)).toContain("Already sent to Elena Marquez.");
    expect(text(html)).toContain("send the new copy");
  });
});

describe("repeat bills on the bill builder", () => {
  const ctx: BillContext = {
    kind: "repeat",
    customers: [
      { id: "c1", label: "Okonkwo Dental Group", taxRateId: null, taxRateBps: 0, taxExempt: false, hasCard: true },
      { id: "c2", label: "Elena Marquez", taxRateId: null, taxRateBps: 0, taxExempt: false, hasCard: false },
    ],
    products: [],
    taxRates: [],
    taxRateBps: 0,
    repairs: [],
    recentCustomerIds: [],
  };
  const state = flow.addOneOff(
    flow.initialBillState(ctx, { customerId: "c1", date: "2026-10-18", repeat: { frequency: "MONTHLY", dueInDays: 14 } }),
    { description: "Managed IT plan", unitPriceCents: 45_000, taxable: false },
  );

  it("posts exactly the old schedule form's fields", () => {
    const posted = flow.fieldEntries(state, ctx);
    expect(posted.map(([name]) => name)).toEqual([
      "frequency",
      "active",
      "autoCharge",
      "autoSend",
      "name",
      "customerId",
      "nextRunAt",
      "dueInDays",
      "lines",
    ]);
    const values = Object.fromEntries(posted);
    expect(values.name).toBe("Okonkwo Dental Group · Monthly");
    expect(values.nextRunAt).toBe("2026-10-18");
    expect(values.dueInDays).toBe("14");
    expect(values.active).toBe("true");
    expect(JSON.parse(values.lines)[0]).toMatchObject({ description: "Managed IT plan", unitPriceCents: 45_000, serial: null });
    // Editing posts the schedule's id first.
    expect(flow.fieldEntries(state, ctx, "rec_1")[0]).toEqual(["id", "rec_1"]);
  });

  it("only charges a card that exists", () => {
    const wantsCharge = { ...state, repeat: { ...state.repeat, autoCharge: true } };
    expect(Object.fromEntries(flow.fieldEntries(wantsCharge, ctx)).autoCharge).toBe("true");
    const noCard = flow.withCustomer(wantsCharge, "c2", ctx);
    expect(Object.fromEntries(flow.fieldEntries(noCard, ctx)).autoCharge).toBe("false");
  });

  it("says the whole schedule back in one sentence, and needs a first bill day", () => {
    expect(flow.repeatSentence(state, ctx)).toBe("Bills Okonkwo Dental Group $450.00 every month from Oct 18, 2026.");
    expect(flow.validate({ ...state, date: "" }, ctx).map((issue) => issue.message)).toContain("Pick the day of the first bill.");
    expect(flow.stepLabels("repeat")).toEqual(["Customer", "Items", "How often"]);
    expect(flow.copyFor("repeat").save).toBe("Save repeat bill");
    expect(flow.copyFor("repeat", "edit").dateLabel).toBe("Next bill on");
    expect(flow.payWithinLabel(14)).toBe("Pay within 14 days");
    expect(flow.payWithinLabel(0)).toBe("Due on receipt");
  });

  it("draws How often as tiles and toggles with their words", () => {
    const html = renderToStaticMarkup(
      React.createElement(RepeatStep, {
        state,
        ctx,
        copy: flow.copyFor("repeat"),
        editing: true,
        onDate: () => {},
        onRepeat: () => {},
        issues: [],
        phonePanel: null,
      }),
    );
    const words = text(html);
    expect(words).toContain("Bills Okonkwo Dental Group $450.00 every month from Oct 18, 2026.");
    for (const label of ["Every week", "Every month", "Every 3 months", "Every year", "On receipt", "14 days", "Email each bill to them", "Charge their card", "Billing is on"]) {
      expect(words).toContain(label);
    }
    expect(html).toMatch(/aria-checked="true"[^>]*>.*?Every month/);
    expect(words).toContain(" Off ");
  });
});

describe("cash drawers in plain words, on the shop's clock", () => {
  const ZONE = "America/Edmonton";
  const opened = new Date("2026-10-03T14:00:00.000Z"); // 8:00 AM in Edmonton
  const closed = new Date("2026-10-04T00:12:00.000Z"); // 6:12 PM in Edmonton, already Sunday in UTC

  it("leads with the word and the amount", () => {
    const short = drawerCardWords({ openedAt: opened, closedAt: closed, openingCents: 15_000, expectedCents: 34_100, countedCents: 33_966 }, ZONE);
    expect(short.title).toBe("Short $1.34");
    expect(short.when).toBe("Sat, Oct 3 · 8:00 AM – 6:12 PM");
    expect(drawerCardWords({ openedAt: opened, closedAt: null, openingCents: 15_000, expectedCents: null, countedCents: null }, ZONE).title).toBe("Open now");
    expect(drawerCardWords({ openedAt: opened, closedAt: closed, openingCents: 0, expectedCents: 100, countedCents: 100 }, ZONE).title).toBe("Balanced");
  });

  it("counts the views and says how often the till is off", () => {
    const rows = [
      { openedAt: opened, closedAt: closed, openingCents: 0, expectedCents: 100, countedCents: 99 },
      { openedAt: opened, closedAt: closed, openingCents: 0, expectedCents: 100, countedCents: 100 },
      { openedAt: opened, closedAt: null, openingCents: 0, expectedCents: null, countedCents: null },
    ];
    const counts = drawerViewCounts(rows, ZONE);
    expect(counts).toEqual({ "": 3, short: 1, over: 0, balanced: 1 });
    expect(drawerOffSentence(counts)).toBe("Off 1 time in the last 2 counted drawers: 1 short, 0 over.");
  });

  it("splits the day's takings by how people paid, with refunds", () => {
    const takings = drawerTakings(
      [
        { method: "CARD", cents: 10_000, count: 2 },
        { method: "CASH", cents: 4_000, count: 1 },
      ],
      [{ method: "CASH", cents: 500, count: 1 }],
    );
    expect(takings.rows.map((row) => row.method)).toEqual(["CASH", "CARD", "CHECK", "CREDIT", "OTHER"]);
    expect(takings.netCents).toBe(13_500);
    expect(takings.refundCount).toBe(1);
  });
});
