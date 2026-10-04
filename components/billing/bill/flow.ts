/**
 * The Easy-mode bill builder (new invoice, new estimate), as plain data and
 * plain functions.
 *
 * Everything the screen decides lives here so it can be tested without a
 * browser: what has been chosen (BillState), what is still missing, how a tap
 * on a product changes the lines, and exactly which fields the form posts to
 * createInvoiceAction / createEstimateAction. The components only draw this and
 * call the transitions.
 *
 * THE SERVER CONTRACT DID NOT MOVE. `fieldEntries` posts the very fields the
 * old DocumentForm posted (customerId + newCustomer*, ticketId, date, taxRateId,
 * notes, and the `lines` JSON), and `toPayload` encodes a line the way the old
 * LineItemsEditor did. tests/bill-builder-flow.test.ts holds the two side by side.
 *
 * Pure on purpose: no React, no next/*, no database. Imported by the client
 * components and by the tests.
 */

import { matchesCustomer, type SearchCustomer } from "@/lib/customers/search-options";
import { inventoryGroup } from "@/lib/inventory/groups";
import { calcTotals, formatBps, formatCents, parseCents, type Totals } from "@/lib/money";
import { NO_TAX, defaultTaxRate, type TaxRateOption } from "@/lib/tax";
import type { CustomerOption, ProductOption, SubmittedLine } from "../types";
import type { InitialLine } from "../line-items-editor";

// ---------------------------------------------------------------------------
// Vocabulary shared with the server actions
// ---------------------------------------------------------------------------

/** customerId value meaning "create them with this document". Matches lib/customers/quick-add.ts (kept literal so this file stays client-safe). */
export const NEW = "new";

/** The same ceilings submittedLineSchema enforces on the server. */
export const MAX_QUANTITY = 100_000;
export const MAX_PRICE_CENTS = 100_000_000;

export type BillKind = "invoice" | "estimate";

/** An open repair the document can be linked to (the `ticketId` the old form carried as a hidden field). */
export type RepairOption = {
  id: string;
  number: number;
  subject: string;
  customerId: string;
  status: string;
};

export type BillContext = {
  kind: BillKind;
  customers: CustomerOption[];
  products: ProductOption[];
  taxRates: TaxRateOption[];
  /** The shop's flat rate: what a document with no named rates opens on. */
  taxRateBps: number;
  repairs: RepairOption[];
  /** Customers to tap before anything is typed, most recent first. */
  recentCustomerIds: string[];
};

export type BillInitial = {
  customerId?: string | null;
  ticketId?: string | null;
  /** yyyy-mm-dd */
  date?: string;
  notes?: string | null;
  lines?: InitialLine[];
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export type Copy = {
  noun: "invoice" | "estimate";
  /** The panel's name: "This invoice". */
  panel: string;
  save: string;
  saving: string;
  itemsTitle: string;
  itemsHint: string;
  dateLabel: string;
  dateHint: string;
  dateEmpty: string;
  /** The line under the Save button: what saving does. */
  saveNote: string;
  /** Easy mode says "repair", never "ticket". */
  stepsLabel: string;
};

export function copyFor(kind: BillKind): Copy {
  if (kind === "invoice") {
    return {
      noun: "invoice",
      panel: "This invoice",
      save: "Save invoice",
      saving: "Saving…",
      itemsTitle: "What are you billing?",
      itemsHint: "Tap a picture to add it. Tap again for one more.",
      dateLabel: "Due date",
      dateHint: "Optional. Leave blank for due on receipt.",
      dateEmpty: "Due on receipt",
      saveNote: "Saved as a draft. You can check it before you send it.",
      stepsLabel: "Invoice steps",
    };
  }
  return {
    noun: "estimate",
    panel: "This estimate",
    save: "Save estimate",
    saving: "Saving…",
    itemsTitle: "What are you quoting?",
    itemsHint: "Tap a picture to add it. Tap again for one more.",
    dateLabel: "Expires on",
    dateHint: "Optional. After this date the quote is no longer honoured.",
    dateEmpty: "No expiry date",
    saveNote: "Saved as a draft. You can check it before you send it.",
    stepsLabel: "Estimate steps",
  };
}

export const STEPS = [
  { label: "Customer", title: "Who is this for?", hint: "Search by name or phone number, or add someone new." },
  { label: "Items", title: "", hint: "" },
  { label: "Review", title: "Check and save", hint: "Everything on one page. Change anything before you save." },
] as const;
export const LAST_STEP = STEPS.length - 1;

export function stepTitle(kind: BillKind, step: number): { title: string; hint: string } {
  if (step === 1) {
    const copy = copyFor(kind);
    return { title: copy.itemsTitle, hint: copy.itemsHint };
  }
  return { title: STEPS[step].title, hint: STEPS[step].hint };
}

/** "1 item" / "3 items". */
export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type BillLine = {
  key: string;
  /** null = a one-off item, not in the catalogue. */
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  /** "" = none. */
  serial: string;
};

export type BillState = {
  /** "" until chosen, an id, or NEW. */
  customerId: string;
  newCustomer: { name: string; phone: string; email: string; smsOk: boolean };
  lines: BillLine[];
  taxRateId: string | null;
  taxRateBps: number;
  /** Due date / expiry, yyyy-mm-dd, or "". */
  date: string;
  notes: string;
  /** The linked repair ("" = none). */
  ticketId: string;
  /** Counts the lines made so far, so each gets its own key. */
  seq: number;
};

function lineFromInitial(line: InitialLine, index: number): BillLine {
  return {
    key: `seed-${index}`,
    productId: line.productId ?? null,
    description: line.description ?? "",
    quantity: line.quantity ?? 1,
    unitPriceCents: line.unitPriceCents ?? 0,
    taxable: line.taxable ?? true,
    serial: line.serial ?? "",
  };
}

/**
 * Where a new document opens. The tax follows whoever is chosen (a tax-exempt
 * customer must never sit under a taxed total), exactly as the old form did:
 * a prefilled customer opens on their rate, anyone else on the shop default.
 */
export function initialBillState(ctx: BillContext, initial: BillInitial = {}): BillState {
  const prefill = ctx.customers.find((customer) => customer.id === initial.customerId) ?? null;
  const fallback = defaultTaxRate(ctx.taxRates);
  const tax = prefill
    ? { taxRateId: prefill.taxRateId, taxRateBps: prefill.taxRateBps }
    : fallback
      ? { taxRateId: fallback.id, taxRateBps: fallback.rateBps }
      : { taxRateId: null, taxRateBps: ctx.taxRateBps };
  const lines = (initial.lines ?? []).map(lineFromInitial);
  return {
    customerId: initial.customerId ?? "",
    newCustomer: { name: "", phone: "", email: "", smsOk: true },
    lines,
    taxRateId: tax.taxRateId,
    taxRateBps: tax.taxRateBps,
    date: initial.date ?? "",
    notes: initial.notes ?? "",
    ticketId: initial.ticketId ?? "",
    seq: lines.length,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function customerOf(state: BillState, ctx: Pick<BillContext, "customers">): CustomerOption | null {
  return ctx.customers.find((customer) => customer.id === state.customerId) ?? null;
}

/** "Daniel Reed", the new person's name or number, or "". */
export function customerName(state: BillState, ctx: Pick<BillContext, "customers">): string {
  if (state.customerId === NEW) return state.newCustomer.name.trim() || state.newCustomer.phone.trim();
  return customerOf(state, ctx)?.label ?? "";
}

/**
 * Choosing a person re-prices the document at their rate. Clearing the choice
 * leaves the tax alone (the old form did too), and a linked repair that belongs
 * to somebody else is let go: a bill for one person must not hang off another's job.
 */
export function withCustomer(state: BillState, id: string, ctx: Pick<BillContext, "customers" | "repairs">): BillState {
  if (id === state.customerId) return state;
  const customer = ctx.customers.find((option) => option.id === id);
  const repair = state.ticketId ? ctx.repairs.find((option) => option.id === state.ticketId) : undefined;
  return {
    ...state,
    customerId: id,
    ...(customer ? { taxRateId: customer.taxRateId, taxRateBps: customer.taxRateBps } : {}),
    ...(repair && repair.customerId !== id ? { ticketId: "" } : {}),
  };
}

/** The few people to tap before anything is typed: the recent ones in order, then whoever fills the row. */
export function recentCustomers<T extends { id: string }>(customers: T[], recentIds: string[], count: number): T[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const picked: T[] = [];
  for (const id of recentIds) {
    const customer = byId.get(id);
    if (customer && !picked.includes(customer)) picked.push(customer);
    if (picked.length === count) return picked;
  }
  for (const customer of customers) {
    if (!picked.includes(customer)) picked.push(customer);
    if (picked.length === count) break;
  }
  return picked;
}

export function matchCustomers(customers: SearchCustomer[], query: string): SearchCustomer[] {
  return query.trim() ? customers.filter((customer) => matchesCustomer(customer, query)) : [];
}

/** The same rule the server applies to the new customer's email. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------

/** The repairs the chosen customer has open (all of them while the customer is a new person: none). */
export function repairsFor(state: BillState, ctx: Pick<BillContext, "repairs">): RepairOption[] {
  if (!state.customerId || state.customerId === NEW) return [];
  return ctx.repairs.filter((repair) => repair.customerId === state.customerId);
}

export function repairOf(state: BillState, ctx: Pick<BillContext, "repairs">): RepairOption | null {
  return ctx.repairs.find((repair) => repair.id === state.ticketId) ?? null;
}

export function repairLabel(repair: Pick<RepairOption, "number" | "subject">): string {
  return `Repair #${repair.number}${repair.subject ? ` · ${repair.subject}` : ""}`;
}

export function withRepair(state: BillState, id: string): BillState {
  return state.ticketId === id ? state : { ...state, ticketId: id };
}

// ---------------------------------------------------------------------------
// Products: shelves, search, scan
// ---------------------------------------------------------------------------

export const ALL_SHELF = "all";

export type Shelf = { key: string; label: string; count: number; first: ProductOption };

const SHELF_ORDER = ["screen-guards", "charging", "batteries", "screens", "ports"];

/** The picture boxes the picker opens on: the same shelves as Stock and the Sell screen. */
export function shelvesOf(products: ProductOption[]): Shelf[] {
  const map = new Map<string, Shelf>();
  for (const product of products) {
    const { key, label } = inventoryGroup({ name: product.name, category: product.category ?? null });
    const shelf = map.get(key) ?? { key, label, count: 0, first: product };
    shelf.count++;
    map.set(key, shelf);
  }
  const order = (key: string) => (SHELF_ORDER.includes(key) ? SHELF_ORDER.indexOf(key) : SHELF_ORDER.length);
  return [...map.values()].sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label));
}

/** Products to show: a search always looks through everything, whichever shelf is open. */
export function filterProducts(products: ProductOption[], opts: { shelf: string | null; query: string }): ProductOption[] {
  const needle = opts.query.trim().toLowerCase();
  const shown = products.filter((product) => {
    if (!needle) {
      return opts.shelf === ALL_SHELF || inventoryGroup({ name: product.name, category: product.category ?? null }).key === opts.shelf;
    }
    return (
      product.name.toLowerCase().includes(needle) ||
      (product.sku?.toLowerCase().includes(needle) ?? false) ||
      (product.category?.toLowerCase().includes(needle) ?? false)
    );
  });
  return shown.sort((a, b) => a.name.localeCompare(b.name));
}

/** A typed or scanned code that is exactly one product's SKU. */
export function matchProductCode(products: ProductOption[], code: string): ProductOption | null {
  const lower = code.trim().toLowerCase();
  if (!lower) return null;
  return products.find((product) => product.sku?.trim().toLowerCase() === lower) ?? null;
}

/** A serialized product sold on an invoice is one specific unit, so it asks "which unit?" first. */
export function needsUnit(product: ProductOption, kind: BillKind): boolean {
  return kind === "invoice" && Boolean(product.serialized);
}

/** A line that is one specific unit: nothing to step, nothing to type. */
export function isUnitLine(line: BillLine, kind: BillKind, products: ProductOption[]): boolean {
  if (kind !== "invoice" || !line.productId || line.serial.trim() === "") return false;
  return Boolean(products.find((product) => product.id === line.productId)?.serialized);
}

/** The units of a product still in stock and not already on this bill (a line's own unit stays choosable). */
export function availableUnits(product: ProductOption, state: BillState, exceptKey?: string): string[] {
  const used = new Set(
    state.lines.filter((line) => line.key !== exceptKey && line.serial.trim() !== "").map((line) => line.serial.trim()),
  );
  const own = exceptKey ? state.lines.find((line) => line.key === exceptKey)?.serial.trim() : "";
  const units = (product.serials ?? []).filter((serial) => !used.has(serial));
  return own && !units.includes(own) ? [own, ...units] : units;
}

/** How many of this product are on the bill: the count on its tile. */
export function productQuantity(state: BillState, productId: string): number {
  return state.lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);
}

// ---------------------------------------------------------------------------
// Lines: each transition returns the next state, never mutates
// ---------------------------------------------------------------------------

function nextKey(state: BillState): { key: string; seq: number } {
  return { key: `line-${state.seq}`, seq: state.seq + 1 };
}

/**
 * A tap on a product. A second tap on the same thing makes it one more rather
 * than a second row; a serialized invoice line is one unit each, so it takes the
 * unit chosen (a scanned unit that is already on the bill is not added twice).
 */
export function addProduct(state: BillState, product: ProductOption, kind: BillKind, serial?: string | null): BillState {
  const unit = kind === "invoice" ? (serial ?? "").trim() : "";
  if (unit) {
    if (state.lines.some((line) => line.serial.trim() === unit)) return state;
  } else if (needsUnit(product, kind)) {
    // The screen asks which unit first; without one there is nothing to add.
    return state;
  } else {
    const existing = state.lines.find(
      (line) => line.productId === product.id && line.unitPriceCents === product.priceCents && line.serial.trim() === "",
    );
    if (existing) return setQuantity(state, existing.key, existing.quantity + 1);
  }
  const { key, seq } = nextKey(state);
  const line: BillLine = {
    key,
    productId: product.id,
    description: product.name,
    quantity: 1,
    unitPriceCents: product.priceCents,
    taxable: product.taxable,
    serial: unit,
  };
  return { ...state, lines: [...state.lines, line], seq };
}

/** Something not in the catalogue: a bench fee, a salvaged part, a discount (a minus price). */
export function addOneOff(
  state: BillState,
  item: { description: string; unitPriceCents: number; taxable: boolean; quantity?: number },
): BillState {
  const { key, seq } = nextKey(state);
  const line: BillLine = {
    key,
    productId: null,
    description: item.description.trim(),
    quantity: item.quantity ?? 1,
    unitPriceCents: item.unitPriceCents,
    taxable: item.taxable,
    serial: "",
  };
  return { ...state, lines: [...state.lines, line], seq };
}

/** Stepping to zero (or below) takes the line off, as it does on the Sell screen. */
export function setQuantity(state: BillState, key: string, quantity: number): BillState {
  if (quantity <= 0) return removeLine(state, key);
  const capped = Math.min(Math.floor(quantity), MAX_QUANTITY);
  return { ...state, lines: state.lines.map((line) => (line.key === key ? { ...line, quantity: capped } : line)) };
}

export function removeLine(state: BillState, key: string): BillState {
  return { ...state, lines: state.lines.filter((line) => line.key !== key) };
}

export type LinePatch = Partial<Pick<BillLine, "description" | "quantity" | "unitPriceCents" | "taxable" | "serial">>;

export function updateLine(state: BillState, key: string, patch: LinePatch): BillState {
  return { ...state, lines: state.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) };
}

// ---------------------------------------------------------------------------
// Typed values, for the edit dialogs
// ---------------------------------------------------------------------------

/** "3" -> 3. Anything that is not a whole number from 1 to 100,000 is null. */
export function parseQuantityText(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number.parseInt(cleaned, 10);
  return value >= 1 && value <= MAX_QUANTITY ? value : null;
}

/** "12.50", "$1,200", "-5" -> cents. Anything that is not an amount is null; a minus is a discount. */
export function parsePriceText(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const cents = parseCents(cleaned);
  return Math.abs(cents) <= MAX_PRICE_CENTS ? cents : null;
}

/** cents -> the plain "219.00" an input shows. */
export function centsToInput(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/**
 * One line the way the server reads it: the old LineItemsEditor's encoding
 * (trimmed description, whole quantity, integer cents, a serial only on an
 * invoice, productId null for a one-off).
 */
export function toPayload(lines: BillLine[], kind: BillKind): SubmittedLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    description: line.description.trim(),
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxable: line.taxable,
    serial: kind === "invoice" && line.serial.trim() !== "" ? line.serial.trim() : null,
  }));
}

/** The very same `calcTotals` the server uses, so the panel can never disagree with what is saved. */
export function totalsOf(state: BillState, kind: BillKind): Totals {
  return calcTotals(toPayload(state.lines, kind), state.taxRateBps);
}

export function itemCount(state: BillState): number {
  return state.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** "GST · 5%" for a named rate, "5%" for a flat one. */
export function taxName(state: BillState, ctx: Pick<BillContext, "taxRates">): string {
  const rate = state.taxRateId ? ctx.taxRates.find((option) => option.id === state.taxRateId) : undefined;
  return rate ? `${rate.name} · ${formatBps(rate.rateBps)}` : state.taxRateBps > 0 ? formatBps(state.taxRateBps) : "No tax";
}

/** The tax picker's choices: the active rates, plus the one in use even if it has since been retired. */
export function taxChoices(ctx: Pick<BillContext, "taxRates">, current: string | null): TaxRateOption[] {
  return ctx.taxRates.filter((rate) => rate.active || rate.id === current);
}

/** Picking a rate (or "No tax") re-prices the totals. */
export function withTax(state: BillState, taxRateId: string | null, ctx: Pick<BillContext, "taxRates">): BillState {
  if (taxRateId === null) return { ...state, taxRateId: null, taxRateBps: 0 };
  const rate = ctx.taxRates.find((option) => option.id === taxRateId);
  return { ...state, taxRateId: rate?.id ?? null, taxRateBps: rate?.rateBps ?? 0 };
}

// ---------------------------------------------------------------------------
// What is missing
// ---------------------------------------------------------------------------

export type Issue = { step: number; message: string };

/** What stops this document being saved, in step order. Empty means it can be. */
export function validate(state: BillState, ctx: Pick<BillContext, "kind" | "customers" | "products">): Issue[] {
  const issues: Issue[] = [];
  if (!state.customerId) {
    issues.push({ step: 0, message: "Choose a customer or add a new one." });
  } else if (state.customerId === NEW) {
    const { name, phone, email } = state.newCustomer;
    if (!name.trim() && !phone.trim()) issues.push({ step: 0, message: "Add the new customer's name or phone number." });
    if (email.trim() && !EMAIL.test(email.trim())) {
      issues.push({ step: 0, message: "Enter a valid email address or leave it blank." });
    }
  }
  if (state.lines.length === 0) {
    issues.push({ step: 1, message: "Add at least one item." });
  } else {
    for (const line of state.lines) {
      const product = line.productId ? ctx.products.find((option) => option.id === line.productId) : undefined;
      if (ctx.kind === "invoice" && product?.serialized && (!line.serial.trim() || line.quantity !== 1)) {
        issues.push({ step: 1, message: `Choose which unit of ${line.description || product.name} you are selling.` });
      }
    }
  }
  return issues;
}

/** The first thing in the way, or null. */
export function blockerOf(state: BillState, ctx: Pick<BillContext, "kind" | "customers" | "products">): Issue | null {
  return validate(state, ctx)[0] ?? null;
}

/** Which step can fix what the server refused. Anything unrecognised stays where it is (null). */
export function stepForServerError(message: string): number | null {
  if (/customer|e-?mail|phone/i.test(message)) return 0;
  if (/line|description|quantity|price|serial|unit|stock|sold|item/i.test(message)) return 1;
  return null;
}

// ---------------------------------------------------------------------------
// The stepper, the panel and the phone's bar
// ---------------------------------------------------------------------------

export type StepStatus = { done: boolean; text: string };

export function stepStatuses(state: BillState, ctx: BillContext): StepStatus[] {
  const customerDone = state.customerId !== "" && !validate(state, ctx).some((issue) => issue.step === 0);
  const count = itemCount(state);
  return [
    { done: customerDone, text: customerName(state, ctx) },
    { done: state.lines.length > 0, text: count > 0 ? itemsLabel(count) : "" },
    { done: false, text: "" },
  ];
}

/**
 * "Daniel Reed · 3 items · $45.00": the phone bar's one line. On the last step
 * the Save button takes the room, so the name is left off ("3 items · $45.00").
 */
export function summaryLine(state: BillState, ctx: BillContext, withName = true): string {
  const name = customerName(state, ctx);
  const count = itemCount(state);
  const items = count > 0 ? `${itemsLabel(count)} · ${formatCents(totalsOf(state, ctx.kind).totalCents)}` : "No items yet";
  return withName ? [name || "No customer yet", items].join(" · ") : items;
}

/** The words under the Save button when it cannot be pressed yet. */
export function submitReason(state: BillState, ctx: BillContext): string | null {
  const blocker = blockerOf(state, ctx);
  if (!blocker) return null;
  if (blocker.step === 0) return "Choose a customer first.";
  if (state.lines.length === 0) return "Add at least one item first.";
  return blocker.message;
}

// ---------------------------------------------------------------------------
// What the form posts
// ---------------------------------------------------------------------------

/**
 * Every field the form posts, in the order the old form's inputs sat in the
 * page: the linked repair, the customer (and a new person's details), the date,
 * the tax rate (only when the shop keeps named rates), the notes and the lines.
 */
export function fieldEntries(state: BillState, ctx: Pick<BillContext, "kind" | "taxRates">): [string, string][] {
  const out: [string, string][] = [];
  if (state.ticketId) out.push(["ticketId", state.ticketId]);
  out.push(["customerId", state.customerId]);
  if (state.customerId === NEW) {
    const { name, phone, email, smsOk } = state.newCustomer;
    out.push(["newCustomerName", name], ["newCustomerPhone", phone], ["newCustomerEmail", email]);
    // A ticked box posts "on"; the old box was off (and disabled) with no number.
    if (smsOk && phone.trim() !== "") out.push(["newCustomerSmsOk", "on"]);
  }
  out.push(["date", state.date]);
  if (ctx.taxRates.length > 0) out.push(["taxRateId", state.taxRateId ?? NO_TAX]);
  out.push(["notes", state.notes]);
  out.push(["lines", JSON.stringify(toPayload(state.lines, ctx.kind))]);
  return out;
}

/** The same entries as the FormData the server action receives. */
export function toFormData(state: BillState, ctx: Pick<BillContext, "kind" | "taxRates">): FormData {
  const data = new FormData();
  for (const [name, value] of fieldEntries(state, ctx)) data.append(name, value);
  return data;
}
