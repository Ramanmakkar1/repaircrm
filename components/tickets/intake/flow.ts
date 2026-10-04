/**
 * The Easy-mode check-in, as plain data and plain functions.
 *
 * Everything the screen decides lives here so it can be tested without a
 * browser: what has been chosen (CheckInState), what each step has to say about
 * it, what is still missing, and exactly which fields the form posts to
 * createTicketAction. The components only draw this and call the transitions.
 *
 * Pure on purpose: no React, no next/*, no database. Imported by the client
 * components and by the tests.
 */

import { INTAKE_OTHER_TYPE, easyIntakeProfile } from "@/lib/device-intake";
import { newCustomerSchema, newDeviceSchema, promisedIso, quickPromisedLocal, repairSubject } from "@/lib/intake";
import { formatCents, parseCents } from "@/lib/money";
import { deviceImageSource } from "@/lib/inventory/product-images";
import { catalogEntryByKey } from "@/lib/catalog/match";
import type { DeviceKind } from "@/lib/intake-options";
import type { SearchCustomer } from "@/lib/customers/search-options";

// ---------------------------------------------------------------------------
// Vocabulary shared with createTicketAction
// ---------------------------------------------------------------------------

/** customerId / assetId value meaning "create it with this repair". */
export const NEW = "__new__";
/** assetId / assignedToId / warrantyInvoiceLineId value meaning "nothing". */
export const NONE = "none";
/** checklistTemplateId value meaning "let the problem type decide". */
export const AUTO = "auto";

export type Option = { value: string; label: string };
/** A saved device. type/make/model are display-safe (the unlock code never leaves the server). */
export type AssetOption = Option & { type?: string; make?: string; model?: string };
/** A past purchase still under warranty. */
export type WarrantyOption = Option & { hint: string };

export type CheckInContext = {
  customers: SearchCustomer[];
  assetsByCustomer: Record<string, AssetOption[]>;
  warrantiesByCustomer: Record<string, WarrantyOption[]>;
  techs: Option[];
  problemTypes: string[];
  locations: Option[];
  checklists: Option[];
  /** The shop's own device boxes (Settings, Workflow). Absent: the standard list. */
  deviceKinds?: readonly DeviceKind[];
  /** A picture chosen for a problem, by the problem's name. Absent or missing a problem: the guessed picture or icon. */
  problemPictures?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export const STEPS = [
  { label: "Customer", title: "Who is this for?", hint: "Search by name or phone number, or add someone new." },
  { label: "Device", title: "What are we fixing?", hint: "A saved device, or the kind of device. Everything here is optional." },
  { label: "Problem", title: "What's wrong?", hint: "Tap the closest match. You can add a note after." },
  { label: "Details", title: "Any details?", hint: "All optional. Check in whenever you are ready." },
] as const;
export const LAST_STEP = STEPS.length - 1;

export type DeviceStage = "kind" | "brand" | "model";
export type PromisedChoice = "" | "today" | "tomorrow" | "three" | "week" | "pick";

export type CheckInState = {
  /** "" until chosen, an id, or NEW. */
  customerId: string;
  newCustomer: { name: string; phone: string; email: string; smsOk: boolean };
  /** "" until chosen, NONE, NEW, or a saved device id. */
  assetId: string;
  /** Where the new-device questions are up to (kind, then brand, then model). */
  deviceStage: DeviceStage;
  device: { type: string; make: string; model: string; serial: string; password: string };
  problemType: string;
  /** What the person typed under "Other"; becomes the repair title. */
  otherText: string;
  /** null while the title is the automatic one. */
  subject: string | null;
  notes: string;
  quotedPrice: string;
  inspectionFee: string;
  termsAccepted: boolean;
  priority: string;
  assignedToId: string;
  promised: { choice: PromisedChoice; local: string };
  locationId: string;
  checklistTemplateId: string;
  isWarranty: boolean;
  warrantyLineId: string;
};

export const EMPTY_DEVICE = { type: "", make: "", model: "", serial: "", password: "" };

export function initialState(opts: { customerId?: string; locationId?: string } = {}): CheckInState {
  return {
    customerId: opts.customerId ?? "",
    newCustomer: { name: "", phone: "", email: "", smsOk: true },
    assetId: "",
    deviceStage: "kind",
    device: { ...EMPTY_DEVICE },
    problemType: "",
    otherText: "",
    subject: null,
    notes: "",
    quotedPrice: "",
    inspectionFee: "",
    termsAccepted: false,
    priority: "NORMAL",
    assignedToId: NONE,
    promised: { choice: "", local: "" },
    locationId: opts.locationId ?? "",
    checklistTemplateId: AUTO,
    isWarranty: false,
    warrantyLineId: NONE,
  };
}

/** A repair opened for a customer already (from their page) starts on the device. */
export function initialStep(customerId?: string): number {
  return customerId ? 1 : 0;
}

// ---------------------------------------------------------------------------
// What has been chosen, in words
// ---------------------------------------------------------------------------

export function customerOf(state: CheckInState, ctx: Pick<CheckInContext, "customers">): SearchCustomer | null {
  return ctx.customers.find((customer) => customer.id === state.customerId) ?? null;
}

/** "Daniel Reed", the new person's name or number, or "". */
export function customerName(state: CheckInState, ctx: Pick<CheckInContext, "customers">): string {
  if (state.customerId === NEW) return state.newCustomer.name.trim() || state.newCustomer.phone.trim();
  return customerOf(state, ctx)?.label ?? "";
}

export function savedAssets(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): AssetOption[] {
  return state.customerId ? (ctx.assetsByCustomer[state.customerId] ?? []) : [];
}

/** "Apple iPhone 14", else the type ("Phone"). */
export function savedDeviceName(asset: AssetOption): string {
  return [asset.make, asset.model].filter(Boolean).join(" ") || asset.type || asset.label.split(" · ")[0];
}

/** "Daniel's iPhone 14 Pro": the first name of a person, never of a business or a number. */
export function savedDeviceTitle(customerLabel: string, asset: AssetOption): string {
  const device = savedDeviceName(asset);
  const first = customerLabel.trim().split(/\s+/)[0] ?? "";
  if (!first || /[()]/.test(customerLabel) || !/^\p{L}[\p{L}'’-]*$/u.test(first) || first.toLowerCase() === "customer") return device;
  return `${first}${/s$/i.test(first) ? "’" : "’s"} ${device}`;
}

/** The device's family picture, from the words only; the toolbox when nothing fits. */
export function devicePhoto(...words: (string | undefined)[]): string {
  return deviceImageSource(words.filter(Boolean).join(" "))?.src ?? "/images/products/repair-tools.webp";
}

/** "iPhone 14" for a new device, the saved one's name, "No device", or "" when not chosen yet. */
export function deviceName(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): string {
  if (state.assetId === NEW) return [state.device.make, state.device.model].map((part) => part.trim()).filter(Boolean).join(" ") || state.device.type.trim();
  const asset = savedAssets(state, ctx).find((item) => item.value === state.assetId);
  return asset ? savedDeviceName(asset) : "";
}

export function deviceSummary(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): string {
  if (state.assetId === NONE) return "No device";
  return deviceName(state, ctx);
}

/**
 * "Different device" was tapped but nothing was entered: not a device yet. The
 * screen treats it as "not chosen" (Optional) and the form posts "none", so
 * leaving the step this way never creates an empty "Other" device.
 */
export function isBlankNewDevice(state: CheckInState): boolean {
  const { type, make, model, serial, password } = state.device;
  return state.assetId === NEW && !type && !make && !model && !serial && !password;
}

/** A saved device, "No device", or a new device with something in it. */
export function deviceChosen(state: CheckInState): boolean {
  return state.assetId !== "" && !isBlankNewDevice(state);
}

/** The device type the problems should be tuned to: what was chosen, or what the saved device is. */
export function deviceTypeOf(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): string {
  if (state.assetId === NEW) return state.device.type.trim();
  const asset = savedAssets(state, ctx).find((item) => item.value === state.assetId);
  return asset ? (asset.type ?? "") : "";
}

/** The repair title: the edited one, else "<device> — <problem>" (what the old form did too). */
export function effectiveSubject(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): string {
  if (state.subject !== null) return state.subject;
  return repairSubject(deviceName(state, ctx), state.otherText.trim() || state.problemType);
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/** "Screen Repair" and "Screen" are the same box; "Other" and "Other Repair" too. */
export function problemKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !["repair", "replacement", "problem", "issue"].includes(word))
    .join(" ");
}

/** What the "Other" tile saves: the shop's own wording when it has one. */
export function otherProblem(shopProblems: string[]): string {
  return shopProblems.find((label) => problemKey(label) === "other") ?? "Other Repair";
}

export function isOtherProblem(label: string): boolean {
  return problemKey(label) === "other";
}

/**
 * The problem boxes: what is common for the kind of device first, then the
 * shop's own list, then "Other". With no device chosen the shop's own list
 * leads, because it is the only thing known.
 */
export function problemOptions(type: string, shopProblems: string[]): string[] {
  const common = type ? easyIntakeProfile(type).problems : [...shopProblems, "Diagnostic"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...common, ...shopProblems]) {
    const key = problemKey(label);
    if (!key || key === "other" || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return [...out, otherProblem(shopProblems)];
}

export type ProblemIcon =
  | "water" | "software" | "virus" | "data" | "power" | "picture" | "sound" | "keyboard" | "disc"
  | "damage" | "intermittent" | "maintenance" | "hardware" | "camera" | "other";
export type ProblemVisual = { kind: "photo"; src: string } | { kind: "icon"; icon: ProblemIcon };

const PRODUCTS = "/images/products";

/** A picture where one fits, a clear icon otherwise, the toolbox as the fallback. */
export function problemVisual(label: string): ProblemVisual {
  const text = label.toLowerCase();
  const photo = (name: string): ProblemVisual => ({ kind: "photo", src: `${PRODUCTS}/${name}.webp` });
  const icon = (name: ProblemIcon): ProblemVisual => ({ kind: "icon", icon: name });
  if (isOtherProblem(label)) return icon("other");
  if (/hdmi/.test(text)) return photo("hdmi-port");
  if (/charg/.test(text)) return photo("charging-port");
  if (/batter/.test(text)) return photo("phone-battery");
  if (/screen|display|lcd|crack/.test(text)) return photo("display-assembly");
  if (/diagnos|inspect|check.?up/.test(text)) return photo("repair-tools");
  if (/remote/.test(text)) return photo("tv-remote");
  if (/controller|joystick|stick drift/.test(text)) return photo("game-controller");
  if (/overheat|too hot|fan/.test(text)) return photo("console-cooling-fan");
  if (/water|liquid|spill|wet/.test(text)) return icon("water");
  if (/virus|malware/.test(text)) return icon("virus");
  if (/software|windows|operating|slow|update/.test(text)) return icon("software");
  if (/data|recover|backup|photos/.test(text)) return icon("data");
  if (/no power|power|won.?t turn|dead/.test(text)) return icon("power");
  if (/picture|video|image|backlight/.test(text)) return icon("picture");
  if (/sound|audio|speaker|mic/.test(text)) return icon("sound");
  if (/keyboard|trackpad|key/.test(text)) return icon("keyboard");
  if (/disc|drive/.test(text)) return icon("disc");
  if (/physical|damage|broken|bent|drop/.test(text)) return icon("damage");
  if (/intermittent|random|sometimes|restart|freez|crash/.test(text)) return icon("intermittent");
  if (/maintenance|clean|service|tune/.test(text)) return icon("maintenance");
  if (/hardware|board|chip|motherboard/.test(text)) return icon("hardware");
  if (/camera|lens/.test(text)) return icon("camera");
  return photo("repair-tools");
}

/**
 * The picture key the shop chose for a problem box. The exact name first, then ignoring case, then
 * the same box under another wording ("Screen" and "Screen Repair" are one box, see problemKey).
 */
export function chosenProblemPicture(label: string, pictures: Record<string, string> | undefined): string {
  if (!pictures) return "";
  const names = Object.keys(pictures);
  const exact = names.find((name) => name === label) ?? names.find((name) => name.toLowerCase() === label.toLowerCase());
  if (exact) return pictures[exact];
  const key = problemKey(label);
  if (!key || key === "other") return "";
  const alike = names.find((name) => problemKey(name) === key);
  return alike ? pictures[alike] : "";
}

/** problemVisual, unless the shop chose a picture for this problem. */
export function problemVisualFor(label: string, pictures?: Record<string, string>): ProblemVisual {
  const entry = catalogEntryByKey(chosenProblemPicture(label, pictures));
  return entry ? { kind: "photo", src: entry.image } : problemVisual(label);
}

// ---------------------------------------------------------------------------
// Transitions: each returns the next state, never mutates
// ---------------------------------------------------------------------------

/** Choosing a different person forgets the old person's device and warranty. */
export function withCustomer(state: CheckInState, id: string): CheckInState {
  if (id === state.customerId) return state;
  return {
    ...state,
    customerId: id,
    assetId: "",
    deviceStage: "kind",
    device: { ...EMPTY_DEVICE },
    isWarranty: false,
    warrantyLineId: NONE,
  };
}

export function withSavedDevice(state: CheckInState, assetId: string): CheckInState {
  return { ...state, assetId, deviceStage: "kind", device: { ...EMPTY_DEVICE } };
}

export function withNoDevice(state: CheckInState): CheckInState {
  return { ...state, assetId: NONE, deviceStage: "kind", device: { ...EMPTY_DEVICE } };
}

/** "Different device": a new one, and the kinds are asked again. */
export function withDifferentDevice(state: CheckInState): CheckInState {
  return { ...state, assetId: NEW, deviceStage: "kind", device: { ...EMPTY_DEVICE } };
}

/** A problem chosen for another kind of device is dropped when it no longer applies. */
function keepProblem(state: CheckInState, type: string, shopProblems: string[]): Pick<CheckInState, "problemType" | "otherText" | "subject"> {
  if (!state.problemType || problemOptions(type, shopProblems).includes(state.problemType)) {
    return { problemType: state.problemType, otherText: state.otherText, subject: state.subject };
  }
  return { problemType: "", otherText: "", subject: null };
}

export function withDeviceKind(state: CheckInState, type: string, shopProblems: string[]): CheckInState {
  return {
    ...state,
    assetId: NEW,
    deviceStage: "brand",
    device: { ...EMPTY_DEVICE, type },
    ...keepProblem(state, type, shopProblems),
  };
}

/** Typing what an "Other" device is. Emptying the box goes back to plain "Other", not to the kinds. */
export function withDeviceType(state: CheckInState, typed: string, shopProblems: string[]): CheckInState {
  const type = typed === "" ? INTAKE_OTHER_TYPE : typed;
  return { ...state, device: { ...state.device, type }, ...keepProblem(state, type, shopProblems) };
}

export function withMake(state: CheckInState, make: string): CheckInState {
  return { ...state, deviceStage: "model", device: { ...state.device, make, model: "" } };
}

export function withModel(state: CheckInState, model: string): CheckInState {
  return { ...state, device: { ...state.device, model } };
}

/** Choosing a problem writes the repair title for you. */
export function withProblem(state: CheckInState, problemType: string): CheckInState {
  return { ...state, problemType, otherText: "", subject: null };
}

/** The pickup tiles. Choosing the same one again clears it, and the shop's own target applies. */
export function withPromised(state: CheckInState, choice: Exclude<PromisedChoice, "">, now: Date = new Date()): CheckInState {
  if (state.promised.choice === choice) return { ...state, promised: { choice: "", local: "" } };
  if (choice === "pick") return { ...state, promised: { choice, local: state.promised.local || quickPromisedLocal(1, now) } };
  return { ...state, promised: { choice, local: quickPromisedLocal(PROMISED_DAYS[choice], now) } };
}

export const PROMISED_DAYS = { today: 0, tomorrow: 1, three: 3, week: 7 } as const;
export const PROMISED_TILES: { choice: Exclude<PromisedChoice, "">; label: string }[] = [
  { choice: "today", label: "Today" },
  { choice: "tomorrow", label: "Tomorrow" },
  { choice: "three", label: "In 3 days" },
  { choice: "week", label: "Next week" },
  { choice: "pick", label: "Pick a date" },
];

/** "Sat, Oct 4, 5:00 PM", or "" for no date. */
export function promisedLabel(local: string): string {
  const date = local ? new Date(local) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Validation: the same rules as the server, in plain words, tied to a step
// ---------------------------------------------------------------------------

export type Issue = { step: number; field: string; message: string };

export const MSG = {
  customer: "Choose a customer first.",
  contact: "Enter a name or a phone number.",
  email: "That email address does not look right. Fix it or leave it blank.",
  tooLong: "That is too long. Please shorten it.",
  deviceType: "Say what kind of device it is.",
  problem: "Choose what's wrong first.",
  subject: "Describe the repair in a few words.",
  price: "Enter a price from 0 to 1,000,000.",
} as const;

function priceIssue(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const amount = Number(text);
  return !Number.isFinite(amount) || amount < 0 || amount > 1_000_000;
}

export function validate(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): Issue[] {
  const issues: Issue[] = [];

  if (!state.customerId) {
    issues.push({ step: 0, field: "customerId", message: MSG.customer });
  } else if (state.customerId === NEW) {
    const { name, email, phone } = state.newCustomer;
    const parsed = newCustomerSchema.safeParse({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        const field = key === "email" ? "newCustomerEmail" : key === "phone" ? "newCustomerPhone" : "newCustomerName";
        const message = issue.code === "too_big" ? MSG.tooLong : key === "email" ? MSG.email : MSG.contact;
        issues.push({ step: 0, field, message });
      }
    }
  }

  if (state.assetId === NEW && !isBlankNewDevice(state)) {
    const parsed = newDeviceSchema.safeParse({
      type: state.device.type.trim() || INTAKE_OTHER_TYPE,
      make: state.device.make.trim(),
      model: state.device.model.trim(),
      serial: state.device.serial.trim(),
      password: state.device.password,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        const fields: Record<string, string> = { type: "newDeviceType", make: "newDeviceMake", model: "newDeviceModel", serial: "newDeviceSerial", password: "newDevicePassword" };
        issues.push({ step: 1, field: fields[key] ?? "newDeviceType", message: issue.code === "too_big" ? MSG.tooLong : MSG.deviceType });
      }
    }
  }

  if (!state.problemType.trim()) {
    issues.push({ step: 2, field: "problemType", message: MSG.problem });
  } else {
    const subject = effectiveSubject(state, ctx).trim();
    if (!subject) issues.push({ step: 2, field: "subject", message: MSG.subject });
    else if (subject.length > 200 || state.problemType.length > 80) issues.push({ step: 2, field: "subject", message: MSG.tooLong });
  }

  if (priceIssue(state.quotedPrice)) issues.push({ step: 3, field: "quotedPrice", message: MSG.price });
  if (priceIssue(state.inspectionFee)) issues.push({ step: 3, field: "inspectionFee", message: MSG.price });

  return issues;
}

/** The first thing still in the way of checking in, in plain words, or null. */
export function submitBlocker(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): Issue | null {
  return validate(state, ctx)[0] ?? null;
}

export function canSubmit(state: CheckInState, ctx: Pick<CheckInContext, "assetsByCustomer">): boolean {
  return submitBlocker(state, ctx) === null;
}

/** The first message for one step, for the phone's bar (which is always on screen), or null. */
export function stepMessage(issues: Issue[], step: number): string | null {
  return issues.find((issue) => issue.step === step)?.message ?? null;
}

/** Which step a message from createTicketAction belongs to, so a refusal lands where it can be fixed. */
export function stepForServerError(message: string): number {
  if (/customer|contact|name or a phone/i.test(message)) return 0;
  if (/device/i.test(message)) return 1;
  if (/problem|subject|shorten/i.test(message)) return 2;
  if (/price|pickup|date/i.test(message)) return 3;
  return 3;
}

// ---------------------------------------------------------------------------
// The stepper and the summary
// ---------------------------------------------------------------------------

export function detailsSummary(state: CheckInState): string {
  const parts = [
    state.quotedPrice.trim() && !priceIssue(state.quotedPrice) ? formatCents(parseCents(state.quotedPrice)) : "",
    state.promised.local ? promisedLabel(state.promised.local) : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

export function stepStatus(state: CheckInState, ctx: CheckInContext, step: number): { done: boolean; text: string } {
  if (step === 0) {
    const name = customerName(state, ctx);
    return { done: Boolean(name) && !validate(state, ctx).some((issue) => issue.step === 0), text: name };
  }
  if (step === 1) return { done: deviceChosen(state), text: deviceSummary(state, ctx) };
  if (step === 2) return { done: Boolean(state.problemType), text: state.problemType };
  const text = detailsSummary(state);
  return { done: Boolean(text) || state.priority !== "NORMAL" || state.assignedToId !== NONE || Boolean(state.notes.trim()), text };
}

export type SummaryRow = { label: string; value: string; empty: string; step: number };

/** "This repair": what is chosen so far, one row per thing, each with the step that changes it. */
export function summaryRows(state: CheckInState, ctx: CheckInContext): SummaryRow[] {
  const price = state.quotedPrice.trim() && !priceIssue(state.quotedPrice) ? formatCents(parseCents(state.quotedPrice)) : "";
  return [
    { label: "Customer", value: customerName(state, ctx), empty: "Not chosen yet", step: 0 },
    { label: "Device", value: deviceSummary(state, ctx), empty: "Optional", step: 1 },
    { label: "Problem", value: state.problemType, empty: "Not chosen yet", step: 2 },
    { label: "Price", value: price, empty: "Not quoted", step: 3 },
    { label: "Promised", value: promisedLabel(state.promised.local), empty: "Usual time", step: 3 },
  ];
}

/** One line for the phone's bar: "Daniel Reed · iPhone 14 · Screen Repair". */
export function summaryLine(state: CheckInState, ctx: CheckInContext): string {
  const parts = [customerName(state, ctx), deviceSummary(state, ctx), state.problemType].filter(Boolean);
  return parts.join(" · ") || "Nothing chosen yet";
}

/** What the device step's main button says: "Skip" until something is entered, then "Next". */
export function deviceNextLabel(state: CheckInState): string {
  if (!deviceChosen(state)) return "Skip, I'll add it later";
  if (state.assetId === NEW) {
    const { make, model, serial, password } = state.device;
    if (state.deviceStage === "brand") return make.trim() ? "Next: Model" : "Skip, I'll add it later";
    if (state.deviceStage === "model" && !model.trim() && !serial.trim() && !password) return "Skip, I'll add it later";
  }
  return "Next: Problem";
}

/**
 * What the device step's Next does: an untouched device (nothing tapped, or
 * "Different device" with nothing entered) becomes "No device"; a
 * brand typed but never tapped is taken and the model asked for; anything else
 * moves on to the problem. `leave` says whether to change step.
 */
export function advanceDevice(state: CheckInState): { state: CheckInState; leave: boolean } {
  if (!deviceChosen(state)) return { state: withNoDevice(state), leave: true };
  if (state.assetId === NEW && state.deviceStage === "brand" && state.device.make.trim()) {
    return { state: withMake(state, state.device.make.trim()), leave: false };
  }
  return { state, leave: true };
}

export function nextLabel(state: CheckInState, step: number): string {
  if (step === 0) return "Next: Device";
  if (step === 1) return deviceNextLabel(state);
  if (step === 2) return "Next: Details";
  return "Check in repair";
}

// ---------------------------------------------------------------------------
// What the form posts
// ---------------------------------------------------------------------------

/**
 * Every field createTicketAction reads, exactly as it reads them. A field that
 * does not apply (a new-customer name for an existing customer, a location when
 * there is only one) is left out, as the old form left it out.
 */
export function fieldValues(
  state: CheckInState,
  ctx: Pick<CheckInContext, "assetsByCustomer" | "locations" | "checklists">,
): Record<string, string> {
  const values: Record<string, string> = { customerId: state.customerId };

  if (state.customerId === NEW) {
    values.newCustomerName = state.newCustomer.name;
    values.newCustomerPhone = state.newCustomer.phone;
    values.newCustomerEmail = state.newCustomer.email;
    if (state.newCustomer.smsOk && state.newCustomer.phone.trim()) values.newCustomerSmsOk = "on";
  }

  // "Different device" with nothing entered posts "none", never an empty "Other" device.
  const assetId = isBlankNewDevice(state) ? "" : state.assetId;
  values.assetId = assetId || NONE;
  if (assetId === NEW) {
    values.newDeviceType = state.device.type.trim() || INTAKE_OTHER_TYPE;
    values.newDeviceMake = state.device.make;
    values.newDeviceModel = state.device.model;
    values.newDeviceSerial = state.device.serial;
    values.newDevicePassword = state.device.password;
  }

  values.problemType = state.problemType;
  values.subject = effectiveSubject(state, ctx);
  values.quotedPrice = state.quotedPrice.trim();
  values.inspectionFee = state.inspectionFee.trim();
  if (state.termsAccepted) values.termsAccepted = "on";
  values.priority = state.priority;
  values.assignedToId = state.assignedToId;
  values.promisedAt = promisedIso(state.promised.local);
  if (ctx.locations.length > 1 && state.locationId) values.locationId = state.locationId;
  if (ctx.checklists.length > 0) values.checklistTemplateId = state.checklistTemplateId;
  if (state.isWarranty && state.customerId && state.customerId !== NEW) values.warrantyInvoiceLineId = state.warrantyLineId;
  values.diagnosticNotes = state.notes;

  return values;
}

export function toFormData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}
