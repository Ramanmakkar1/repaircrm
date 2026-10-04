import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/invoices/new" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; className?: string }) => createElement("img", { alt: props.alt, className: props.className }),
}));

const { DocumentForm } = await import("@/components/billing/document-form");
const flow = await import("@/components/billing/bill/flow");
const { BillPanel } = await import("@/components/billing/bill/panel");
const { ReviewStep } = await import("@/components/billing/bill/step-review");
const { LineRow } = await import("@/components/billing/bill/line-row");
const { PICK_LIST_CLASS, RepairList, UnitList } = await import("@/components/billing/bill/dialogs");

import type { BillContext, BillKind, BillLine, BillState } from "@/components/billing/bill/flow";
import type { CustomerOption, ProductOption } from "@/components/billing/types";
import type { TaxRateOption } from "@/lib/tax";

/**
 * The repair pass on the bill builder (new invoice / new estimate, Easy mode).
 *
 * 1. "From repair" and "Which unit?" ran wider than their window: a long repair
 *    title was cut with no ellipsis and a sideways scrollbar showed, because a
 *    bare `grid` column is as wide as its widest row.
 * 2. "This invoice" on a counter tablet showed about two lines of the bill: each
 *    line took two rows plus the picture's, "More options" scrolled away with
 *    them, the page title sat above the panel, and the Review step listed no lines.
 */

const customers: CustomerOption[] = [
  { id: "c1", label: "Amara Nwosu", mobile: "(512) 555-0156", taxRateId: "tx1", taxRateBps: 825, taxExempt: false },
];
const taxRates: TaxRateOption[] = [{ id: "tx1", name: "Texas sales tax", rateBps: 825, isDefault: true, active: true }];
const products: ProductOption[] = [
  { id: "p1", name: "Tempered Glass Protector", sku: "ACC-TG", priceCents: 2499, taxable: true, category: "Screen guards" },
  { id: "p2", name: "iPhone 14 Screen", sku: "SCR-IP14", priceCents: 18900, taxable: true, category: "Screens", serialized: true, serials: ["SN-100", "SN-101"] },
];
const repairs = [{ id: "t1", number: 1015, subject: "Cracked screen", customerId: "c1", status: "In Progress" }];

const ctxFor = (kind: BillKind): BillContext => ({
  kind,
  customers,
  products,
  taxRates,
  taxRateBps: 825,
  repairs,
  recentCustomerIds: ["c1"],
});

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** The whole element that opens at `from`, found by counting its own tag's opens and closes. */
function elementAt(html: string, from: number): string {
  const tag = /^<([a-z0-9]+)/.exec(html.slice(from))?.[1];
  if (!tag) throw new Error("not at a tag");
  const pattern = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "g");
  pattern.lastIndex = from;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (match[1] === "") {
      if (!match[0].endsWith("/>")) depth += 1;
    } else {
      depth -= 1;
    }
    if (depth === 0) return html.slice(from, pattern.lastIndex);
  }
  throw new Error("unbalanced markup");
}
/** The element carrying `marker` (an attribute such as data-bill-lines=""). */
const elementWith = (html: string, marker: string) => {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker}`);
  return { from: html.lastIndexOf("<", at), html: elementAt(html, html.lastIndexOf("<", at)) };
};

const lineState = (kind: BillKind = "invoice"): BillState => {
  const ctx = ctxFor(kind);
  let state = flow.initialBillState(ctx, { customerId: "c1" });
  state = flow.addProduct(flow.addProduct(state, products[0], kind), products[0], kind);
  state = flow.addProduct(state, products[1], kind, "SN-100");
  state = flow.addOneOff(state, { description: "Bench fee", unitPriceCents: 2000, taxable: false });
  return state;
};

const panelProps = (state: BillState, kind: BillKind = "invoice", extra: Record<string, unknown> = {}) => ({
  state,
  ctx: ctxFor(kind),
  copy: flow.copyFor(kind),
  totals: flow.totalsOf(state, kind),
  onStep: noop,
  onQuantity: noop,
  onRemove: noop,
  onEdit: noop,
  onTax: noop,
  onDate: noop,
  onNotes: noop,
  reason: flow.submitReason(state, ctxFor(kind)),
  pending: false,
  idPrefix: "t",
  ...extra,
});

const easy = (kind: BillKind, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(DocumentForm, {
      action: async () => ({ error: null }),
      kind,
      customers,
      products,
      taxRateBps: 825,
      taxRates,
      repairs,
      recentCustomerIds: ["c1"],
      initial: {},
      submitLabel: "Create",
      cancelHref: "/x",
      simple: true,
      ...extra,
    } as never),
  );

describe("the pick lists in 'From repair' and 'Which unit?'", () => {
  const longTitle = "XPS 13 — failing SSD, recover documents first and then reinstall everything the customer had on the old drive";
  const longRepairs = [
    { id: "t1", number: 1005, subject: longTitle, customerId: "c1", status: "In Progress" },
    { id: "t2", number: 1013, subject: "Touch dropping out", customerId: "c1", status: "Ready for Pickup" },
  ];

  it("lets its one column shrink to the window, and leaves room for the focus ring", () => {
    // A bare `grid` has an `auto` column, which never goes narrower than its widest row.
    expect(PICK_LIST_CLASS).toContain("grid-cols-[minmax(0,1fr)]");
    expect(PICK_LIST_CLASS).toContain("overflow-y-auto");
    expect(PICK_LIST_CLASS).toMatch(/(?:^|\s)p-1(?:\s|$)/);
    // ...and the extra padding does not push the rows in from the text above them.
    expect(PICK_LIST_CLASS).toMatch(/(?:^|\s)-m-1(?:\s|$)/);
  });

  it("is used by both lists, and the windows themselves no longer carry a bare grid", () => {
    const source = readFileSync("components/billing/bill/dialogs.tsx", "utf8");
    expect(source.match(/<ul className=\{PICK_LIST_CLASS\}>/g)).toHaveLength(2);
    expect(source).not.toMatch(/<ul className="grid\b/);
  });

  it("draws the repairs on that list, each row able to shrink, a long title stopping at two lines", () => {
    const out = renderToStaticMarkup(createElement(RepairList, { repairs: longRepairs, currentId: "t2", onPick: noop }));
    expect(out).toContain("grid-cols-[minmax(0,1fr)]");
    expect(out.match(/<li class="min-w-0">/g)).toHaveLength(2);
    expect(text(out)).toContain("Repair #1005 · XPS 13 — failing SSD, recover documents first");
    // The full title is in the markup (the clamp shortens it on screen, not the text).
    expect(out).toContain("line-clamp-2");
    expect(out).not.toMatch(/class="[^"]*\btruncate\b/);
    // The linked one is ticked and said to be pressed; the status is in words.
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(text(out)).toContain("In Progress");
    expect(text(out)).toContain("Ready for Pickup");
    expect(out.match(/min-h-14/g)).toHaveLength(2);
  });

  it("draws the units on that list, a long serial wrapping rather than being cut", () => {
    const serial = "SN-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const out = renderToStaticMarkup(createElement(UnitList, { units: [serial, "SN-2"], onPick: noop }));
    expect(out).toContain("grid-cols-[minmax(0,1fr)]");
    expect(out.match(/<li class="min-w-0">/g)).toHaveLength(2);
    expect(out).toContain(serial); // read in full
    expect(out).toContain("[overflow-wrap:anywhere]");
    expect(out).not.toMatch(/class="[^"]*\btruncate\b/);
  });
});

describe("a line of the panel", () => {
  const state = lineState();
  const row = (line: BillLine, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(LineRow, {
        line,
        product: products.find((product) => product.id === line.productId),
        unit: false,
        onQuantity: noop,
        onEdit: noop,
        onRemove: noop,
        ...extra,
      } as never),
    );

  it("keeps the minus, the count, the plus, Edit and the bin in one row of buttons", () => {
    const out = row(state.lines[0]);
    const controls = elementWith(out, 'data-line-controls=""').html;
    for (const label of ["Fewer Tempered Glass Protector", "More Tempered Glass Protector", "Edit Tempered Glass Protector", "Remove Tempered Glass Protector"]) {
      expect(controls, label).toContain(`aria-label="${label}"`);
    }
    // Every one stays a 48px target.
    expect(controls.match(/size-12/g)).toHaveLength(4);
  });

  it("gives the picture no row of its own: it is 40px and sits beside the name and the buttons", () => {
    const out = row(state.lines[0]);
    expect(out).toContain("size-10");
    expect(out).not.toContain("size-12 shrink-0 rounded-md\""); // the old 48px picture row
    // The picture is the first thing in the line, the name, the price and the buttons share the column after it.
    const li = out.slice(out.indexOf("<li"));
    const pictureAt = li.indexOf("<img");
    const columnAt = li.indexOf('<div class="flex min-w-0 flex-1 flex-col">');
    expect(pictureAt).toBeGreaterThan(-1);
    expect(columnAt).toBeGreaterThan(pictureAt);
    expect(li.indexOf("Tempered Glass Protector", columnAt)).toBeGreaterThan(columnAt);
    expect(li.indexOf('data-line-controls=""')).toBeGreaterThan(columnAt);
  });

  it("says what one costs only when there is more than one, in words", () => {
    const two = state.lines[0]; // two of them
    expect(two.quantity).toBe(2);
    expect(text(row(two))).toContain("$24.99 each");
    expect(text(row(two))).toContain("$49.98");
    const one = { ...two, quantity: 1 };
    expect(text(row(one))).not.toContain("each");
    expect(text(row(one))).toContain("$24.99");
  });

  it("still shows the serial, the no-tax word and, for one unit, no steppers", () => {
    const unit = state.lines[1];
    const out = row(unit, { unit: true });
    expect(text(out)).toContain("Serial SN-100");
    expect(text(out)).toContain("One unit · $189.00");
    expect(out).not.toContain("Fewer iPhone 14 Screen");
    expect(out).toContain('aria-label="Edit iPhone 14 Screen"');
    expect(out).toContain('aria-label="Remove iPhone 14 Screen"');
    expect(text(row(state.lines[2]))).toContain("No tax");
  });
});

describe("the panel on a counter tablet", () => {
  it("scrolls only the lines: More options, the tax, the total and the button are under them", () => {
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState()) as never));
    const scroller = elementWith(out, 'data-bill-lines=""');
    expect(scroller.html).toContain("overflow-y-auto");
    expect(scroller.html).toContain("Tempered Glass Protector");
    // The toggle, the subtotal, the tax picker, the total and Save all come after the scroller closes.
    const after = out.slice(scroller.from + scroller.html.length);
    expect(scroller.html).not.toContain("data-bill-more");
    expect(scroller.html).not.toContain("Subtotal");
    expect(after).toContain('data-bill-more=""');
    expect(after).toContain('aria-expanded="false"');
    expect(text(after)).toContain("More options");
    expect(text(after)).toContain("Subtotal");
    expect(after).toContain("<select");
    expect(text(after)).toContain("Total");
    expect(text(after)).toContain("Save invoice");
  });

  it("puts More options on the Subtotal row, so it costs one row, not two", () => {
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState()) as never));
    const toggleAt = out.indexOf('data-bill-more=""');
    const row = elementAt(out, out.lastIndexOf("<div", toggleAt));
    expect(text(row)).toContain("More options");
    expect(text(row)).toContain("Subtotal");
    expect(text(row)).toContain("$258.98");
  });

  it("has no toggle where the Review step shows the date and notes in full, and no Cancel of its own", () => {
    const review = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState(), "invoice", { showOptions: false }) as never));
    expect(review).not.toContain("data-bill-more");
    expect(text(review)).toContain("Subtotal");
    expect(text(review)).toContain("Save invoice");
    expect(text(review)).not.toContain("Cancel");
    expect(review).not.toContain('href="/counter"');
  });

  it("is taller than before and starts at the top of the page, with the page title above the choices", () => {
    const html = easy("invoice", {
      header: createElement("div", { "data-page-header": "" }, "NEW INVOICE TITLE"),
    });
    // The aside is as tall as the screen less the top bar (it used to be 10rem less, which left it short).
    expect(html).toContain("lg:h-[calc(100dvh-7rem)]");
    expect(html).not.toContain("lg:h-[calc(100dvh-10rem)]");
    // The title is the first thing in the choices column: after the form opens, before the steps.
    const form = html.indexOf("<form");
    const title = html.indexOf("NEW INVOICE TITLE");
    const steps = html.indexOf('aria-label="Invoice steps"');
    expect(form).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(form);
    expect(title).toBeLessThan(steps);
    // ...and so before the panel, which therefore starts level with it.
    expect(title).toBeLessThan(html.indexOf('aria-label="This invoice"'));
    // Drawn once.
    expect(html.match(/NEW INVOICE TITLE/g)).toHaveLength(1);
  });

  it("draws no title at all when none is passed, and Full mode still gets the header exactly once, above the old form", () => {
    expect(easy("estimate")).not.toContain("data-page-header");
    const full = easy("invoice", { simple: false, header: createElement("div", { "data-page-header": "" }, "FULL TITLE") });
    expect(full.match(/FULL TITLE/g)).toHaveLength(1);
    expect(full.indexOf("FULL TITLE")).toBeLessThan(full.indexOf("<form"));
    expect(full).not.toContain("data-bill-lines");
  });
});

describe("the Review step on a wide screen", () => {
  const props = (state: BillState, kind: BillKind = "invoice") => ({
    state,
    ctx: ctxFor(kind),
    copy: flow.copyFor(kind),
    totals: flow.totalsOf(state, kind),
    onStep: noop,
    onDate: noop,
    onNotes: noop,
    phonePanel: createElement("div", { "data-phone-panel": "" }, "PANEL"),
    issues: [],
  });

  it("lists every line read-only: how many, what, what it comes to, with the serial and the no-tax word", () => {
    const out = renderToStaticMarkup(createElement(ReviewStep, props(lineState()) as never));
    const list = elementWith(out, 'data-review-items=""').html;
    expect(list.match(/<li\b/g)).toHaveLength(3);
    const words = text(list);
    expect(words).toContain("2 × Tempered Glass Protector");
    expect(words).toContain("$49.98");
    expect(words).toContain("1 × iPhone 14 Screen");
    expect(words).toContain("Serial SN-100");
    expect(words).toContain("$189.00");
    expect(words).toContain("1 × Bench fee");
    expect(words).toContain("No tax");
    expect(words).toContain("$20.00");
    // Plain text, not controls.
    expect(list).not.toContain("<button");
    expect(list).not.toContain("<input");
  });

  it("is for the wide layout only (the phone has the panel right under the summary), and sits inside the Summary card under Items", () => {
    const out = renderToStaticMarkup(createElement(ReviewStep, props(lineState()) as never));
    const list = elementWith(out, 'data-review-items=""').html;
    expect(list).toContain("hidden");
    expect(list).toContain("lg:flex");
    const summary = elementWith(out, 'aria-label="Summary"').html;
    expect(summary).toContain("data-review-items");
    expect(summary.indexOf("Items")).toBeLessThan(summary.indexOf("data-review-items"));
    expect(summary.indexOf("data-review-items")).toBeLessThan(summary.indexOf("Total"));
    expect(out).toContain("PANEL"); // the phone's panel is still there
  });

  it("says the document it is for, and shows no list when there is nothing on it", () => {
    const estimate = renderToStaticMarkup(createElement(ReviewStep, props(lineState("estimate"), "estimate") as never));
    expect(estimate).toContain('aria-label="Items on this estimate"');
    expect(text(elementWith(estimate, 'data-review-items=""').html)).not.toContain("Serial"); // an estimate carries no unit
    const empty = renderToStaticMarkup(createElement(ReviewStep, props(flow.initialBillState(ctxFor("invoice"), { customerId: "c1" })) as never));
    expect(empty).not.toContain("data-review-items");
    expect(text(empty)).toContain("Nothing added yet");
  });

  it("uses only the house colours", () => {
    for (const file of ["line-row", "panel", "step-review", "dialogs"]) {
      expect(readFileSync(`components/billing/bill/${file}.tsx`, "utf8"), file).not.toMatch(/\b(?:bg-white|bg-black|text-white)\b|\[#[0-9a-f]{3,8}\]/i);
    }
  });
});
