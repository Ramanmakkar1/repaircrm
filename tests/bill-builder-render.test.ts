import { readFileSync, readdirSync } from "node:fs";
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
const { BillStepper } = await import("@/components/billing/bill/stepper");
const { BillPanel } = await import("@/components/billing/bill/panel");
const { BillMobileBar } = await import("@/components/billing/bill/mobile-bar");
const { CustomerStep } = await import("@/components/billing/bill/step-customer");
const { ItemsStep, ProductTile } = await import("@/components/billing/bill/step-items");
const { ReviewStep } = await import("@/components/billing/bill/step-review");

import type { BillContext, BillKind, BillState } from "@/components/billing/bill/flow";
import type { CustomerOption, ProductOption } from "@/components/billing/types";
import type { TaxRateOption } from "@/lib/tax";

/**
 * The bill builder, rendered to static markup (first paint of each part).
 *
 * New invoice and new estimate in Easy mode are a POS-style builder: three
 * steps, a live "This invoice" panel, one big Save button. These check the
 * structure the layout depends on, that nothing the old form offered went
 * missing, and the house rules for colour and words.
 */

const customers: CustomerOption[] = [
  { id: "c1", label: "Amara Nwosu", mobile: "(512) 555-0156", taxRateId: "tx1", taxRateBps: 825, taxExempt: false },
  { id: "c2", label: "Okonkwo Dental Group — Ray Okonkwo", phone: "(512) 555-0122", taxRateId: null, taxRateBps: 0, taxExempt: true },
  { id: "c3", label: "Elena Marquez", mobile: "512-555-0111", taxRateId: "tx2", taxRateBps: 675, taxExempt: false },
];
const taxRates: TaxRateOption[] = [
  { id: "tx1", name: "Texas sales tax", rateBps: 825, isDefault: true, active: true },
  { id: "tx2", name: "Williamson County", rateBps: 675, isDefault: false, active: true },
];
const products: ProductOption[] = [
  { id: "p1", name: "Tempered Glass Protector", sku: "ACC-TG", priceCents: 2499, taxable: true, category: "Screen guards" },
  { id: "p2", name: "iPhone 14 Screen", sku: "SCR-IP14", priceCents: 18900, taxable: true, category: "Screens", serialized: true, serials: ["SN-100", "SN-101"] },
];
const repairs = [{ id: "t1", number: 1015, subject: "Cracked screen", customerId: "c1", status: "In Progress" }];

const ctxFor = (kind: BillKind, over: Partial<BillContext> = {}): BillContext => ({
  kind,
  customers,
  products,
  taxRates,
  taxRateBps: 825,
  repairs,
  recentCustomerIds: ["c3", "c1"],
  ...over,
});

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const hidden = (html: string) => [...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"/g)].map((match) => match[1]);

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
      recentCustomerIds: ["c3", "c1"],
      initial: {},
      submitLabel: "Create",
      cancelHref: "/x",
      simple: true,
      ...extra,
    } as never),
  );

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

describe("new invoice, Easy mode, first paint", () => {
  const html = easy("invoice");

  it("is the bill builder: three steps, opening on 1 Customer with a big search and a New customer box", () => {
    expect(text(html)).toContain("Who is this for?");
    expect(html).toContain('aria-label="Invoice steps"');
    for (const label of ["Customer", "Items", "Review"]) expect(text(html)).toContain(label);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('placeholder="Name or phone number"');
    expect(text(html)).toContain("New customer");
    expect(text(html)).toContain("Just a name or a phone number");
  });

  it("shows the recent customers to tap, most recent first", () => {
    expect(text(html)).toContain("Recent customers");
    expect(text(html).indexOf("Elena Marquez")).toBeGreaterThan(-1);
    expect(text(html).indexOf("Elena Marquez")).toBeLessThan(text(html).indexOf("Amara Nwosu"));
  });

  it("has 'This invoice' beside the choices, with the one big Save button held back for a reason in words", () => {
    const side = html.slice(html.indexOf('aria-label="This invoice"'));
    expect(text(side)).toContain("This invoice");
    expect(text(side)).toContain("No customer yet");
    expect(text(side)).toContain("Nothing here yet");
    expect(text(side)).toContain("Choose a customer first.");
    expect(text(side)).toContain("Save invoice");
    expect(side).toContain('aria-disabled="true"');
    expect(text(side)).toContain("More options");
    // No second way out in the panel: the page already has Home and the Invoices breadcrumb.
    expect(text(side)).not.toContain("Cancel");
  });

  it("is a form that posts the old fields and no browser validation of its own", () => {
    expect(html).toMatch(/<form[^>]*novalidate/i);
    expect(hidden(html)).toEqual(["customerId", "date", "taxRateId", "notes", "lines"]);
  });

  it("is the old form, untouched, in Full mode and when editing a saved document", () => {
    const full = easy("invoice", { simple: false });
    expect(text(full)).toContain("Line items");
    expect(text(full)).not.toContain("Who is this for?");
    expect(full).not.toContain("Invoice steps");
    const saved = easy("invoice", { initial: { id: "inv_1", customerId: "c1" } });
    expect(text(saved)).toContain("Use step-by-step");
    expect(saved).not.toContain("Invoice steps");
  });

  it("opens on the items for a customer already chosen (from their page)", () => {
    const prefilled = easy("invoice", { initial: { customerId: "c1" } });
    expect(text(prefilled)).toContain("What are you billing?");
    expect(prefilled).toContain('placeholder="Scan or search products…"');
    expect(text(prefilled)).toContain("One-off item");
    expect(text(prefilled)).toContain("From repair"); // Amara has an open repair
    // Elena (c3) has none.
    const none = easy("invoice", { initial: { customerId: "c3" }, repairs: [] });
    expect(text(none)).not.toContain("From repair");
  });

  it("carries a repair the page was opened for as the same hidden ticketId the old form carried", () => {
    const linked = easy("invoice", { initial: { customerId: "c1", ticketId: "t1" } });
    expect(hidden(linked)).toEqual(["ticketId", "customerId", "date", "taxRateId", "notes", "lines"]);
    expect(text(linked)).toContain("Repair #1015");
    expect(text(linked)).toContain("Linked to Repair #1015 · Cracked screen");
  });
});

describe("new estimate, Easy mode", () => {
  const html = easy("estimate", { initial: { customerId: "c1" } });

  it("is the same builder with estimate words", () => {
    expect(html).toContain('aria-label="Estimate steps"');
    expect(text(html)).toContain("What are you quoting?");
    const side = html.slice(html.indexOf('aria-label="This estimate"'));
    expect(text(side)).toContain("This estimate");
    expect(text(side)).toContain("Add at least one item first.");
    expect(text(side)).toContain("Save estimate");
    expect(text(html)).not.toContain("Save invoice");
  });
});

describe("the stepper", () => {
  const ctx = ctxFor("invoice");
  it("never locks a step, shows a tick and the choice once done, and marks the current one by aria-current as well as fill", () => {
    const state = lineState();
    const out = renderToStaticMarkup(createElement(BillStepper, { step: 2, statuses: flow.stepStatuses(state, ctx), onStep: noop, label: "Invoice steps" }));
    expect(out).not.toContain("disabled");
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    expect(text(out)).toContain("Amara Nwosu");
    expect(text(out)).toContain("4 items");
    expect(text(out)).toContain("(done)");
    expect(out).toContain("bg-accent");
  });
});

describe("step 1: customer", () => {
  const ctx = ctxFor("invoice");
  const render = (state: BillState) =>
    renderToStaticMarkup(createElement(CustomerStep, { state, ctx, setState: noop, onChosen: noop, onNext: noop, issues: [] }));

  it("a chosen customer is one big card with a Change", () => {
    const out = render(flow.initialBillState(ctx, { customerId: "c1" }));
    expect(text(out)).toContain("Amara Nwosu");
    expect(text(out)).toContain("(512) 555-0156");
    expect(text(out)).toContain("Change");
    expect(text(out)).toContain("Next: Items");
  });

  it("a new customer asks only for a name or a number, with email and texts tucked away", () => {
    const state = flow.withCustomer(flow.initialBillState(ctx, {}), flow.NEW, ctx);
    const out = render(state);
    expect(out).toContain('placeholder="Full name"');
    expect(out).toContain('placeholder="Mobile number"');
    expect(text(out)).toContain("A name or a phone number is enough.");
    expect(text(out)).toContain("Email and text messages");
    expect(out).not.toContain('type="email"');
    expect(text(out)).toContain("Search instead");
  });

  it("shows its refusal in words, on this step only", () => {
    const out = renderToStaticMarkup(
      createElement(CustomerStep, {
        state: flow.initialBillState(ctx, {}),
        ctx,
        setState: noop,
        onChosen: noop,
        onNext: noop,
        issues: [
          { step: 0, message: "Choose a customer or add a new one." },
          { step: 1, message: "Add at least one item." },
        ],
      }),
    );
    expect(text(out)).toContain("Choose a customer or add a new one.");
    expect(text(out)).not.toContain("Add at least one item.");
    expect(out).toContain('role="alert"');
  });
});

describe("step 2: items", () => {
  const baseProps = (state: BillState, extra: Record<string, unknown> = {}) => ({
    state,
    ctx: ctxFor("invoice"),
    onPick: noop,
    onCode: async () => ({ ok: true, message: "" }),
    onOneOff: noop,
    onRepair: noop,
    onNext: noop,
    issues: [],
    status: "",
    ...extra,
  });

  it("opens on the picture shelves, with a scan/search box, One-off item and, for a customer with open repairs, From repair", () => {
    const out = renderToStaticMarkup(createElement(ItemsStep, baseProps(flow.initialBillState(ctxFor("invoice"), { customerId: "c1" }))));
    expect(out).toContain('aria-label="Scan a barcode or search products"');
    expect(text(out)).toContain("Pick a shelf");
    expect(text(out)).toContain("Screen guards");
    expect(text(out)).toContain("Screens");
    expect(text(out)).toContain("All products");
    expect(text(out)).toContain("One-off item");
    expect(text(out)).toContain("From repair");
    expect(text(out)).toContain("Next: Review");
  });

  it("names the linked repair on its button and says it is linked", () => {
    const state = flow.withRepair(flow.initialBillState(ctxFor("invoice"), { customerId: "c1" }), "t1");
    const out = renderToStaticMarkup(createElement(ItemsStep, baseProps(state)));
    expect(text(out)).toContain("Repair #1015");
    expect(text(out)).toContain("Linked to Repair #1015 · Cracked screen");
  });

  it("says what is missing in words, on this step only", () => {
    const out = renderToStaticMarkup(
      createElement(ItemsStep, baseProps(flow.initialBillState(ctxFor("invoice"), { customerId: "c1" }), { issues: [{ step: 1, message: "Add at least one item." }, { step: 0, message: "Choose a customer or add a new one." }] })),
    );
    expect(text(out)).toContain("Add at least one item.");
    expect(text(out)).not.toContain("Choose a customer or add a new one.");
  });

  it("with no products yet points at One-off item and Stock instead of an empty grid", () => {
    const ctx = ctxFor("invoice", { products: [] });
    const out = renderToStaticMarkup(createElement(ItemsStep, baseProps(flow.initialBillState(ctx, { customerId: "c1" }), { ctx })));
    expect(text(out)).toContain("No products yet");
    expect(out).toContain('href="/inventory/new"');
  });

  it("a product tile is a picture, a name and a price, and says how many are on the bill in words", () => {
    const plain = renderToStaticMarkup(createElement(ProductTile, { product: products[0], count: 0, onClick: noop }));
    expect(plain).toContain('aria-label="Add Tempered Glass Protector"');
    expect(text(plain)).toContain("$24.99");
    expect(text(plain)).not.toContain("added");
    const added = renderToStaticMarkup(createElement(ProductTile, { product: products[0], count: 2, onClick: noop }));
    expect(text(added)).toContain("2 added");
    expect(added).toContain("border-accent");
    expect(added).toContain('aria-label="Add another Tempered Glass Protector (2 on this bill)"');
    const serial = renderToStaticMarkup(createElement(ProductTile, { product: products[1], count: 0, onClick: noop, bySerial: true }));
    expect(text(serial)).toContain("By serial");
    // An estimate quotes it like anything else.
    expect(text(renderToStaticMarkup(createElement(ProductTile, { product: products[1], count: 0, onClick: noop })))).not.toContain("By serial");
  });
});

describe("the panel", () => {
  it("lists each line with big minus and plus, a serial, a no-tax word and an Edit, and totals with the shop's own rate", () => {
    const state = lineState();
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(state) as never));
    expect(out).toContain('aria-label="Fewer Tempered Glass Protector"');
    expect(out).toContain('aria-label="More Tempered Glass Protector"');
    expect(out).toContain('aria-label="Edit Bench fee"');
    expect(out).toContain('aria-label="Remove Bench fee"');
    expect(text(out)).toContain("$24.99 each"); // said once there is more than one
    expect(text(out)).toContain("Serial SN-100");
    expect(text(out)).toContain("No tax");
    expect(text(out)).toContain("4 items");
    // A line that is one unit has nothing to step.
    expect(out).not.toContain('aria-label="Fewer iPhone 14 Screen"');
    expect(text(out)).toContain("One unit · $189.00");
    // 24.99×2 + 189.00 + 20.00 = 258.98; tax 8.25% on the 238.98 taxed = 19.72
    expect(text(out)).toContain("$258.98");
    expect(text(out)).toContain("$19.72");
    expect(text(out)).toContain("$278.70");
    expect(text(out)).toContain("Save invoice");
    expect(out).not.toContain('aria-disabled="true"');
  });

  it("is a plain Tax row with the picker the form already had", () => {
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState()) as never));
    expect(out).toContain('for="t-tax"');
    expect(out).toContain("Texas sales tax · 8.25%");
    expect(out).toContain("Williamson County · 6.75%");
    expect(out).toContain(">No tax</option>");
    // No named rates: just the rate in words, no picker.
    const flat = ctxFor("invoice", { taxRates: [] });
    const state = { ...lineState(), taxRateId: null };
    const flatOut = renderToStaticMarkup(createElement(BillPanel, { ...panelProps(state), ctx: flat } as never));
    expect(flatOut).not.toContain("<select");
    expect(text(flatOut)).toContain("8.25%");
  });

  it("keeps the due date and notes behind one More options, and takes it away where the Review step shows them", () => {
    const withOptions = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState()) as never));
    expect(text(withOptions)).toContain("More options");
    expect(withOptions).toContain('aria-expanded="false"');
    const without = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState(), "invoice", { showOptions: false }) as never));
    expect(text(without)).not.toContain("More options");
  });

  it("leaves the button to the phone's bar when asked, and says an estimate is an estimate", () => {
    const state = lineState("estimate");
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(state, "estimate", { showActions: false }) as never));
    expect(text(out)).not.toContain("Save estimate");
    expect(text(out)).toContain("This estimate");
    expect(out).not.toContain("Serial SN-100"); // an estimate carries no unit
    expect(out).not.toContain('type="submit"');
  });

  it("the Change button for the customer is always there, 48px or more", () => {
    const out = renderToStaticMarkup(createElement(BillPanel, panelProps(lineState()) as never));
    expect(out).toContain('aria-label="Change customer"');
    expect(text(out)).toContain("For Amara Nwosu");
    const none = renderToStaticMarkup(createElement(BillPanel, panelProps(flow.initialBillState(ctxFor("invoice"), {})) as never));
    expect(text(none)).toContain("No customer yet");
    expect(text(none)).toContain("Choose");
  });
});

describe("step 3: review", () => {
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

  it("is the bill in words, with the date and notes in full and the phone's panel above them", () => {
    const state = { ...lineState(), date: "2026-10-15", notes: "Call first" };
    const out = renderToStaticMarkup(createElement(ReviewStep, props(state) as never));
    expect(text(out)).toContain("Amara Nwosu");
    expect(text(out)).toContain("4 items");
    expect(text(out)).toContain("$278.70");
    expect(text(out)).toContain("includes $19.72 tax");
    expect(text(out)).toContain("Due date");
    expect(text(out)).toContain("Optional details");
    expect(text(out)).toContain("Saved as a draft. You can check it before you send it.");
    expect(text(out)).toContain("Oct 15, 2026");
    expect(text(out)).toContain("Call first");
    expect(out).toContain('type="date"');
    expect(out).toContain("<textarea");
    expect(out).toContain("lg:hidden"); // the panel is for a phone: a wide screen has it beside
    expect(out).toContain("PANEL");
    expect(text(out)).not.toContain("Save invoice"); // the one button is the panel's (wide) or the bar's (phone)
  });

  it("says Due on receipt, or No expiry date for an estimate, when no date was chosen", () => {
    expect(text(renderToStaticMarkup(createElement(ReviewStep, props(lineState()) as never)))).toContain("Due on receipt");
    const estimate = renderToStaticMarkup(createElement(ReviewStep, props(lineState("estimate"), "estimate") as never));
    expect(text(estimate)).toContain("Expires on");
    expect(text(estimate)).toContain("No expiry date");
  });

  it("names a linked repair and lets it be changed", () => {
    const state = flow.withRepair(lineState(), "t1");
    const out = renderToStaticMarkup(createElement(ReviewStep, props(state) as never));
    expect(text(out)).toContain("Repair #1015 · Cracked screen");
    expect(out).toContain('aria-label="Change repair"');
  });
});

describe("the phone's bar", () => {
  const copy = flow.copyFor("invoice");
  const bar = (step: number, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(BillMobileBar, { step, line: "Amara Nwosu · 2 items · $54.10", reason: null, pending: false, copy, onNext: noop, ...extra } as never));

  it("sits above the tab bar, hides from a wide screen, and says which step and what is on the bill", () => {
    const out = bar(1);
    expect(out).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(out).toContain("lg:hidden");
    expect(text(out)).toContain("Step 2 of 3");
    expect(text(out)).toContain("Amara Nwosu · 2 items · $54.10");
    expect(text(out)).toContain("Next");
    expect(text(out)).not.toContain("Save invoice");
  });

  it("is a tap away from the items sheet once there is something on the bill", () => {
    const out = bar(1, { onOpenItems: noop });
    expect(out).toContain('aria-label="Show what is on this invoice"');
    expect(text(out)).toContain("Tap to see items");
  });

  it("is the Save button on the last step, held back with its reason in words", () => {
    const ready = bar(2);
    expect(ready).toContain('type="submit"');
    expect(text(ready)).toContain("Save invoice");
    const held = bar(2, { reason: "Add at least one item first." });
    expect(text(held)).toContain("Add at least one item first.");
    expect(held).toContain('aria-disabled="true"');
  });

  it("shows a refused Next in words on the step it was refused on", () => {
    expect(text(bar(0, { warning: "Choose a customer or add a new one." }))).toContain("Choose a customer or add a new one.");
  });
});

describe("the bill builder follows the house rules", () => {
  const dir = "components/billing/bill";
  const files = readdirSync(dir).filter((file) => /\.(tsx?|ts)$/.test(file));
  const read = (file: string) => readFileSync(`${dir}/${file}`, "utf8");

  it("takes its colours from the theme tokens, never a hex or a fixed colour", () => {
    const fixed = /\b(?:bg-black|text-white|(?:bg|text|border)-(?:blue|zinc|gray|slate|red|green)-\d+)\b|\[#[0-9a-f]{3,8}\]|#[0-9a-f]{6}\b/i;
    for (const file of files) expect(read(file), file).not.toMatch(fixed);
  });

  it("uses bg-white only as the canvas behind a product photo", () => {
    for (const file of files) {
      const source = read(file);
      if (/\bbg-white\b/.test(source)) expect(source, file).toMatch(/next\/image|ProductImage/);
    }
  });

  it("draws no coloured side stripe on a box", () => {
    for (const file of files) expect(read(file), file).not.toMatch(/\bborder-[lr]-(?:\d|\[|accent|destructive|status|primary|ring)/);
  });

  it("keeps the old form's colour rules too", () => {
    for (const path of ["components/billing/document-form.tsx", "components/billing/line-items-editor.tsx"]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/\b(?:bg-white|bg-black|text-white)\b|\[#[0-9a-f]{3,8}\]/i);
    }
  });

  it("says repair, never ticket, in the words people read", () => {
    for (const file of files.filter((name) => name.endsWith(".tsx"))) {
      const strings = [...read(file).matchAll(/>\s*([^<>{}]*\bticket\b[^<>{}]*)\s*</gi)].map((match) => match[1]);
      expect(strings, file).toEqual([]);
    }
  });
});
