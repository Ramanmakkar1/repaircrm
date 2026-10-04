import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { INTAKE_DEVICE_KINDS, easyIntakeProfile, easyModelOptions } from "@/lib/device-intake";
import { promisedDate, promisedIso, quickPromisedLocal } from "@/lib/intake";
import {
  AUTO,
  NEW,
  NONE,
  advanceDevice,
  canSubmit,
  customerName,
  deviceName,
  deviceNextLabel,
  deviceSummary,
  effectiveSubject,
  fieldValues,
  initialState,
  initialStep,
  isOtherProblem,
  nextLabel,
  otherProblem,
  problemOptions,
  problemVisual,
  savedDeviceTitle,
  stepForServerError,
  stepStatus,
  submitBlocker,
  summaryLine,
  summaryRows,
  toFormData,
  validate,
  withCustomer,
  withDeviceKind,
  withDifferentDevice,
  withMake,
  withModel,
  withNoDevice,
  withProblem,
  withPromised,
  withSavedDevice,
  type AssetOption,
  type CheckInContext,
  type CheckInState,
} from "@/components/tickets/intake/flow";

const ELENA: AssetOption = { value: "ast_1", label: "Apple iPhone 14 Pro · Phone · F2LX7A", type: "Phone", make: "Apple", model: "iPhone 14 Pro" };

const ctx: CheckInContext = {
  customers: [
    { id: "cus_1", label: "Elena Marquez", mobile: "512-555-0101" },
    { id: "cus_2", label: "Daniel Brooks", phone: "512-555-0145" },
  ],
  assetsByCustomer: { cus_1: [ELENA], cus_2: [] },
  warrantiesByCustomer: { cus_1: [{ value: "line_1", label: "Screen", hint: "Invoice #1 · expires Nov 3" }] },
  techs: [{ value: "usr_1", label: "Dana Ortiz" }],
  problemTypes: ["Hardware", "Software", "Screen", "Battery", "Water Damage", "Other"],
  locations: [],
  checklists: [],
};

/** A state with a customer and a problem: the least that can be checked in. */
function ready(patch: Partial<CheckInState> = {}): CheckInState {
  return { ...initialState({ customerId: "cus_1" }), problemType: "Screen Repair", ...patch };
}

describe("problem boxes", () => {
  it("puts what is common for the device first, then the shop's own list, then Other", () => {
    const options = problemOptions("Phone", ctx.problemTypes);
    expect(options.slice(0, 6)).toEqual(["Screen Repair", "Battery Replacement", "Charging Port Repair", "Water Damage", "Software / Virus", "Diagnostic"]);
    expect(options.at(-1)).toBe("Other");
  });

  it("folds look-alikes: the shop's 'Screen' and 'Battery' are the profile's 'Screen Repair' and 'Battery Replacement'", () => {
    const options = problemOptions("Phone", ctx.problemTypes);
    expect(options).not.toContain("Screen");
    expect(options).not.toContain("Battery");
    // ...but a shop type with no look-alike stays, once.
    expect(options.filter((label) => label === "Hardware")).toHaveLength(1);
    expect(options.filter((label) => label === "Water Damage")).toHaveLength(1);
  });

  it("offers a console its own problems, not a phone's", () => {
    const options = problemOptions("Game console", []);
    expect(options).toContain("HDMI Port Repair");
    expect(options).not.toContain("Screen Repair");
  });

  it("leads with the shop's own list when no device was chosen", () => {
    expect(problemOptions("", ["Hardware", "Software"])).toEqual(["Hardware", "Software", "Diagnostic", "Other Repair"]);
  });

  it("saves 'Other' as the shop's own word for it when it has one", () => {
    expect(otherProblem(["Screen", "Other"])).toBe("Other");
    expect(otherProblem(["Screen"])).toBe("Other Repair");
    expect(isOtherProblem("Other Repair")).toBe(true);
    expect(isOtherProblem("Other")).toBe(true);
    expect(isOtherProblem("Screen Repair")).toBe(false);
  });

  it("gives every box a picture where one fits and an icon otherwise", () => {
    const photo = (label: string) => problemVisual(label);
    expect(photo("Screen Repair")).toEqual({ kind: "photo", src: "/images/products/display-assembly.webp" });
    expect(photo("Screen")).toEqual({ kind: "photo", src: "/images/products/display-assembly.webp" });
    expect(photo("Battery Replacement")).toEqual({ kind: "photo", src: "/images/products/phone-battery.webp" });
    expect(photo("Charging Port Repair")).toEqual({ kind: "photo", src: "/images/products/charging-port.webp" });
    expect(photo("Diagnostic")).toEqual({ kind: "photo", src: "/images/products/repair-tools.webp" });
    expect(photo("HDMI Port Repair")).toEqual({ kind: "photo", src: "/images/products/hdmi-port.webp" });
    expect(photo("Water Damage")).toEqual({ kind: "icon", icon: "water" });
    expect(photo("Software / Virus")).toEqual({ kind: "icon", icon: "virus" });
    expect(photo("Data Recovery")).toEqual({ kind: "icon", icon: "data" });
    expect(photo("Other")).toEqual({ kind: "icon", icon: "other" });
    // Something nobody planned for gets the toolbox, never a broken picture.
    expect(photo("Squeaky hinge")).toEqual({ kind: "photo", src: "/images/products/repair-tools.webp" });
  });

  it("only points at pictures that exist", () => {
    const files = ["Screen", "Battery", "Charging port", "Diagnostic", "HDMI Port Repair", "Remote Problem", "Controller Repair", "Overheating", "Anything else"];
    for (const label of files) {
      const visual = problemVisual(label);
      if (visual.kind === "photo") expect(() => readFileSync(`public${visual.src}`)).not.toThrow();
    }
    for (const kind of INTAKE_DEVICE_KINDS) expect(() => readFileSync(`public/images/products/${kind.photo}.webp`)).not.toThrow();
  });
});

describe("device kinds", () => {
  it("has the eight kinds, each with a picture, and every one gets sensible problems", () => {
    expect(INTAKE_DEVICE_KINDS.map((kind) => kind.label)).toEqual(["Phone", "Tablet", "Laptop", "Computer", "Game console", "TV", "Watch", "Other"]);
    for (const kind of INTAKE_DEVICE_KINDS) {
      const profile = easyIntakeProfile(kind.type);
      expect(profile.makes.length).toBeGreaterThan(0);
      expect(profile.problems.length).toBeGreaterThan(0);
    }
  });

  it("does not offer a watch phone problems, or a desktop MacBook models", () => {
    expect(easyIntakeProfile("Smartwatch").makes).toContain("Garmin");
    expect(easyModelOptions("Smartwatch", "Apple")).toEqual(["Apple Watch"]);
    expect(easyModelOptions("Desktop", "Apple")).toEqual([]);
    expect(easyModelOptions("Phone", "Apple")).toEqual(["iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16"]);
    expect(easyModelOptions("Game console", "Sony")).toEqual(["PlayStation 4", "PlayStation 5"]);
  });
});

describe("the repair title", () => {
  it("is '<device> — <problem>' until somebody edits it", () => {
    const state = withProblem(withDeviceKind(ready(), "Phone", ctx.problemTypes), "Screen Repair");
    expect(effectiveSubject(withMake(state, "Apple"), ctx)).toBe("Apple — Screen Repair");
    expect(effectiveSubject(withModel(withMake(state, "Apple"), "iPhone 14"), ctx)).toBe("Apple iPhone 14 — Screen Repair");
  });

  it("uses a saved device's own name", () => {
    const state = withProblem(withSavedDevice(ready(), "ast_1"), "Battery Replacement");
    expect(effectiveSubject(state, ctx)).toBe("Apple iPhone 14 Pro — Battery Replacement");
  });

  it("is just the problem with no device, and empty with no problem", () => {
    expect(effectiveSubject(withNoDevice(ready()), ctx)).toBe("Screen Repair");
    expect(effectiveSubject(initialState({ customerId: "cus_1" }), ctx)).toBe("");
  });

  it("keeps an edited title, and choosing a problem writes a fresh one", () => {
    const edited = { ...withProblem(withNoDevice(ready()), "Screen Repair"), subject: "Left edge dead" };
    expect(effectiveSubject(edited, ctx)).toBe("Left edge dead");
    expect(effectiveSubject(withProblem(edited, "Battery Replacement"), ctx)).toBe("Battery Replacement");
  });

  it("uses what was typed under Other", () => {
    const other = { ...withProblem(withNoDevice(ready()), "Other Repair"), otherText: "Makes a clicking noise" };
    expect(effectiveSubject(other, ctx)).toBe("Makes a clicking noise");
    expect(fieldValues(other, ctx).problemType).toBe("Other Repair");
    expect(fieldValues(other, ctx).subject).toBe("Makes a clicking noise");
  });
});

describe("choosing things", () => {
  it("forgets the device and the warranty when the customer changes, and keeps them when it does not", () => {
    const chosen = { ...withSavedDevice(ready(), "ast_1"), isWarranty: true, warrantyLineId: "line_1" };
    expect(withCustomer(chosen, "cus_1")).toBe(chosen);
    const other = withCustomer(chosen, "cus_2");
    expect(other).toMatchObject({ customerId: "cus_2", assetId: "", isWarranty: false, warrantyLineId: NONE });
  });

  it("starts a new device at the brand, and brand then model", () => {
    const kind = withDeviceKind(ready(), "Phone", ctx.problemTypes);
    expect(kind).toMatchObject({ assetId: NEW, deviceStage: "brand", device: { type: "Phone", make: "", model: "" } });
    const make = withMake(withModel(kind, "stale"), "Samsung");
    expect(make).toMatchObject({ deviceStage: "model", device: { make: "Samsung", model: "" } });
  });

  it("drops a problem that does not fit the new kind of device, and keeps one that does", () => {
    const phone = withProblem(withDeviceKind(ready(), "Phone", ctx.problemTypes), "Screen Repair");
    expect(withDeviceKind(phone, "Tablet", ctx.problemTypes).problemType).toBe("Screen Repair");
    const dropped = withDeviceKind(phone, "Game console", ctx.problemTypes);
    expect(dropped).toMatchObject({ problemType: "", subject: null });
  });

  it("'Different device' and 'No device' are explicit choices", () => {
    expect(withDifferentDevice(ready())).toMatchObject({ assetId: NEW, device: { type: "" } });
    expect(withNoDevice(ready()).assetId).toBe(NONE);
  });

  it("the pickup tiles pick a time at 5 pm, and tapping the same one again clears it", () => {
    const now = new Date(2026, 9, 3, 10, 30);
    const tomorrow = withPromised(ready(), "tomorrow", now);
    expect(tomorrow.promised).toEqual({ choice: "tomorrow", local: "2026-10-04T17:00" });
    expect(withPromised(tomorrow, "tomorrow", now).promised).toEqual({ choice: "", local: "" });
    expect(withPromised(ready(), "today", now).promised.local).toBe("2026-10-03T17:00");
    expect(withPromised(ready(), "three", now).promised.local).toBe("2026-10-06T17:00");
    expect(withPromised(ready(), "week", now).promised.local).toBe("2026-10-10T17:00");
    expect(withPromised(ready(), "pick", now).promised.choice).toBe("pick");
  });

  it("opens on the device when a customer was passed in, on the customer otherwise", () => {
    expect(initialStep("cus_1")).toBe(1);
    expect(initialStep(undefined)).toBe(0);
    expect(initialState({ customerId: "cus_1" }).customerId).toBe("cus_1");
  });
});

describe("what the stepper and the summary say", () => {
  it("names the customer, the device and the problem as they are chosen", () => {
    const state = withProblem(withSavedDevice(ready(), "ast_1"), "Screen Repair");
    expect(customerName(state, ctx)).toBe("Elena Marquez");
    expect(deviceName(state, ctx)).toBe("Apple iPhone 14 Pro");
    expect(summaryLine(state, ctx)).toBe("Elena Marquez · Apple iPhone 14 Pro · Screen Repair");
    expect(summaryRows(state, ctx).map((row) => [row.label, row.value])).toEqual([
      ["Customer", "Elena Marquez"],
      ["Device", "Apple iPhone 14 Pro"],
      ["Problem", "Screen Repair"],
      ["Price", ""],
      ["Promised", ""],
    ]);
    expect(summaryRows(state, ctx).map((row) => row.step)).toEqual([0, 1, 2, 3, 3]);
  });

  it("calls an unchosen device optional and a skipped one 'No device'", () => {
    expect(deviceSummary(ready(), ctx)).toBe("");
    expect(deviceSummary(withNoDevice(ready()), ctx)).toBe("No device");
    expect(summaryRows(ready(), ctx)[1]).toMatchObject({ value: "", empty: "Optional" });
  });

  it("names a new customer by name, else by number", () => {
    const named = { ...initialState(), customerId: NEW, newCustomer: { name: "Sam Lee", phone: "", email: "", smsOk: true } };
    expect(customerName(named, ctx)).toBe("Sam Lee");
    expect(customerName({ ...named, newCustomer: { ...named.newCustomer, name: "", phone: "5125550199" } }, ctx)).toBe("5125550199");
  });

  it("shows the price as money, and ignores one that is not valid", () => {
    expect(summaryRows({ ...ready(), quotedPrice: "120" }, ctx)[3].value).toBe("$120.00");
    expect(summaryRows({ ...ready(), quotedPrice: "-5" }, ctx)[3].value).toBe("");
  });

  it("marks a step done once it has a choice", () => {
    expect(stepStatus(initialState(), ctx, 0).done).toBe(false);
    expect(stepStatus(ready(), ctx, 0)).toEqual({ done: true, text: "Elena Marquez" });
    expect(stepStatus(ready(), ctx, 1).done).toBe(false);
    expect(stepStatus(withNoDevice(ready()), ctx, 1)).toEqual({ done: true, text: "No device" });
    expect(stepStatus(ready(), ctx, 2)).toEqual({ done: true, text: "Screen Repair" });
    expect(stepStatus(ready(), ctx, 3).done).toBe(false);
    expect(stepStatus({ ...ready(), priority: "URGENT" }, ctx, 3).done).toBe(true);
  });

  it("does not tick a new customer with neither a name nor a number", () => {
    const empty = { ...initialState(), customerId: NEW };
    expect(stepStatus(empty, ctx, 0).done).toBe(false);
  });

  it("makes a possessive of a person's first name, never of a business or a number", () => {
    expect(savedDeviceTitle("Daniel Brooks", ELENA)).toBe("Daniel’s Apple iPhone 14 Pro");
    expect(savedDeviceTitle("James Hughes", ELENA)).toBe("James’ Apple iPhone 14 Pro");
    expect(savedDeviceTitle("Acme Ltd (Daniel Brooks)", ELENA)).toBe("Apple iPhone 14 Pro");
    expect(savedDeviceTitle("Customer 5125550199", ELENA)).toBe("Apple iPhone 14 Pro");
  });
});

describe("what is missing, in plain words, on the right step", () => {
  it("asks for a customer on step 1 and a problem on step 3, and nothing else", () => {
    expect(validate(initialState(), ctx)).toEqual([
      { step: 0, field: "customerId", message: "Choose a customer first." },
      { step: 2, field: "problemType", message: "Choose what's wrong first." },
    ]);
    expect(validate(ready(), ctx)).toEqual([]);
  });

  it("needs a name or a phone number for a new customer, and no more", () => {
    const base = { ...ready(), customerId: NEW };
    const issues = (name: string, phone: string, email = "") => validate({ ...base, newCustomer: { name, phone, email, smsOk: true } }, ctx);
    expect(issues("", "")).toEqual([{ step: 0, field: "newCustomerName", message: "Enter a name or a phone number." }]);
    expect(issues("Sam Lee", "")).toEqual([]);
    expect(issues("", "512 555 0199")).toEqual([]);
    expect(issues("Sam", "", "not an email")).toEqual([{ step: 0, field: "newCustomerEmail", message: "That email address does not look right. Fix it or leave it blank." }]);
    expect(issues("Sam", "", "SAM@Example.com")).toEqual([]);
  });

  it("accepts a new device with only a kind", () => {
    expect(validate(withProblem(withDeviceKind(ready(), "Television", ctx.problemTypes), "Screen Repair"), ctx)).toEqual([]);
    expect(validate(withProblem(withDeviceKind(ready(), "Other", ctx.problemTypes), "Diagnostic"), ctx)).toEqual([]);
  });

  it("holds a price to 0 through 1,000,000, like the server", () => {
    const price = (quotedPrice: string, inspectionFee = "") => validate({ ...ready(), quotedPrice, inspectionFee }, ctx);
    expect(price("")).toEqual([]);
    expect(price("0")).toEqual([]);
    expect(price("1000000")).toEqual([]);
    expect(price("199.99")).toEqual([]);
    expect(price("-1")).toEqual([{ step: 3, field: "quotedPrice", message: "Enter a price from 0 to 1,000,000." }]);
    expect(price("1000001")).toEqual([{ step: 3, field: "quotedPrice", message: "Enter a price from 0 to 1,000,000." }]);
    expect(price("abc")).toHaveLength(1);
    expect(price("", "-3")).toEqual([{ step: 3, field: "inspectionFee", message: "Enter a price from 0 to 1,000,000." }]);
  });

  it("wants a title once a problem is chosen, and no longer than the server allows", () => {
    expect(validate({ ...ready(), subject: "   " }, ctx)).toEqual([{ step: 2, field: "subject", message: "Describe the repair in a few words." }]);
    expect(validate({ ...ready(), subject: "x".repeat(201) }, ctx)[0]).toMatchObject({ step: 2, field: "subject" });
    expect(validate({ ...ready(), subject: "x".repeat(200) }, ctx)).toEqual([]);
  });

  it("can be checked in with a customer and a problem, and the device is optional", () => {
    expect(canSubmit(ready(), ctx)).toBe(true);
    expect(canSubmit(initialState({ customerId: "cus_1" }), ctx)).toBe(false);
    expect(submitBlocker(initialState(), ctx)?.message).toBe("Choose a customer first.");
    expect(submitBlocker(initialState({ customerId: "cus_1" }), ctx)?.message).toBe("Choose what's wrong first.");
    expect(submitBlocker(ready(), ctx)).toBeNull();
  });

  it("sends a refusal from the server to the step that can fix it", () => {
    const source = readFileSync("app/(app)/tickets/actions.ts", "utf8");
    const body = source.slice(source.indexOf("export async function createTicketAction"), source.indexOf("// Edit / delete"));
    const expected: Record<string, number> = {
      "Pick a customer for this ticket.": 0,
      "A subject is required.": 2,
      "Shorten the subject or problem type.": 2,
      "Pick a problem type.": 2,
      "Check the new device details.": 1,
      "Enter valid non-negative prices.": 3,
      "Choose a valid pickup date and time.": 3,
      "That customer no longer exists.": 0,
      "Enter a name or a phone number.": 0,
      "This contact matches Anna Lopez. Select that existing customer to avoid a duplicate.": 0,
    };
    for (const [message, step] of Object.entries(expected)) expect(stepForServerError(message), message).toBe(step);
    // A message the action gains later has to be placed on purpose.
    const literals = [...body.matchAll(/error: "([^"]+)"/g)].map((match) => match[1]);
    expect(literals.length).toBeGreaterThan(5);
    for (const literal of literals) expect(Object.keys(expected), literal).toContain(literal);
  });
});

describe("the device step's buttons", () => {
  it("says Skip until something is entered", () => {
    expect(deviceNextLabel(initialState())).toBe("Skip, I'll add it later");
    expect(deviceNextLabel(withNoDevice(initialState()))).toBe("Next: Problem");
    expect(deviceNextLabel(withSavedDevice(initialState(), "ast_1"))).toBe("Next: Problem");
    const kind = withDeviceKind(initialState(), "Phone", []);
    expect(deviceNextLabel(kind)).toBe("Skip, I'll add it later");
    const typedBrand = { ...kind, device: { ...kind.device, make: "Acme" } };
    expect(deviceNextLabel(typedBrand)).toBe("Next: Model");
    const model = withMake(kind, "Apple");
    expect(deviceNextLabel(model)).toBe("Skip, I'll add it later");
    expect(deviceNextLabel(withModel(model, "iPhone 14"))).toBe("Next: Problem");
  });

  it("skipping an untouched device means 'No device' and moves on", () => {
    expect(advanceDevice(initialState())).toEqual({ state: withNoDevice(initialState()), leave: true });
  });

  it("takes a brand that was typed but never tapped, and asks for the model before leaving", () => {
    const kind = withDeviceKind(initialState(), "Phone", []);
    const typed = { ...kind, device: { ...kind.device, make: " Acme " } };
    const next = advanceDevice(typed);
    expect(next.leave).toBe(false);
    expect(next.state).toMatchObject({ deviceStage: "model", device: { make: "Acme" } });
  });

  it("leaves with the kind alone, which is enough", () => {
    const kind = withDeviceKind(initialState(), "Phone", []);
    expect(advanceDevice(kind)).toEqual({ state: kind, leave: true });
  });

  it("labels the main button for each step", () => {
    expect(nextLabel(initialState(), 0)).toBe("Next: Device");
    expect(nextLabel(initialState(), 2)).toBe("Next: Details");
    expect(nextLabel(initialState(), 3)).toBe("Check in repair");
  });
});

describe("pickup time", () => {
  it("is five in the afternoon, that many days on, in the browser's own time", () => {
    const from = new Date(2026, 0, 30, 9, 15);
    expect(quickPromisedLocal(0, from)).toBe("2026-01-30T17:00");
    expect(quickPromisedLocal(3, from)).toBe("2026-02-02T17:00");
  });

  it("posts the instant with its zone, which the server accepts", () => {
    const local = quickPromisedLocal(1, new Date(2026, 9, 3, 10, 30));
    const iso = promisedIso(local);
    expect(iso).toBe(new Date(local).toISOString());
    expect(promisedDate(iso)).toEqual(new Date(local));
    expect(promisedIso("")).toBe("");
    expect(promisedIso("not a date")).toBe("");
  });
});

describe("what the form posts", () => {
  /** Every name createTicketAction reads off the form, taken from its source. */
  function readByAction(): string[] {
    const source = readFileSync("app/(app)/tickets/actions.ts", "utf8");
    const body = source.slice(source.indexOf("export async function createTicketAction"), source.indexOf("// Edit / delete"));
    const names = [...body.matchAll(/(?:str|optionalId|optionalDate|bool)\(formData, "([A-Za-z]+)"\)/g)].map((match) => match[1]);
    return [...new Set(names)].sort();
  }

  /** Read by the action and never posted by any form: a status can't be chosen at the counter, and the date comes from the pickup field. */
  const NEVER_POSTED = ["dueDate", "status"];

  const everything: CheckInState = {
    ...initialState({ customerId: NEW, locationId: "loc_2" }),
    newCustomer: { name: "Anna Maria Lopez", phone: "780-555-0142", email: "Anna@Example.com", smsOk: true },
    assetId: NEW,
    device: { type: "Phone", make: "Apple", model: "iPhone 14", serial: "SN1", password: "1234" },
    problemType: "Screen Repair",
    notes: "Dropped on tile",
    quotedPrice: "120.50",
    inspectionFee: "15",
    termsAccepted: true,
    priority: "HIGH",
    assignedToId: "usr_1",
    promised: { choice: "tomorrow", local: "2026-10-04T17:00" },
    checklistTemplateId: "chk_1",
    isWarranty: true,
    warrantyLineId: "line_1",
  };
  const full = { ...ctx, locations: [{ value: "loc_1", label: "Main" }, { value: "loc_2", label: "Mall" }], checklists: [{ value: "chk_1", label: "Screen" }] };

  it("includes every field the action reads, for a new customer and a new device", () => {
    const posted = [...toFormData(fieldValues(everything, full)).keys()];
    // A new customer cannot claim a warranty (the action ignores it), so look at an existing one for that.
    const existing = [...toFormData(fieldValues({ ...everything, customerId: "cus_1", assetId: "ast_1" }, full)).keys()];
    for (const name of readByAction()) {
      if (NEVER_POSTED.includes(name)) continue;
      expect(posted.includes(name) || existing.includes(name), `${name} is read by createTicketAction but never posted`).toBe(true);
    }
  });

  it("posts nothing the action does not read", () => {
    const read = new Set(readByAction());
    for (const name of [...toFormData(fieldValues(everything, full)).keys(), ...toFormData(fieldValues({ ...everything, customerId: "cus_1", assetId: "ast_1" }, full)).keys()]) {
      expect(read.has(name), `${name} is posted but createTicketAction never reads it`).toBe(true);
    }
  });

  it("knows the fields the action reads (so the check above would notice one being added)", () => {
    expect(readByAction()).toEqual(expect.arrayContaining([
      "customerId", "subject", "problemType", "newCustomerName", "newCustomerEmail", "newCustomerPhone", "newCustomerSmsOk",
      "assetId", "newDeviceType", "newDeviceMake", "newDeviceModel", "newDeviceSerial", "newDevicePassword",
      "quotedPrice", "inspectionFee", "promisedAt", "locationId", "priority", "assignedToId", "checklistTemplateId",
      "warrantyInvoiceLineId", "diagnosticNotes", "termsAccepted",
    ]));
  });

  it("posts a new customer and a new device exactly as the action wants them", () => {
    expect(fieldValues(everything, full)).toEqual({
      customerId: "__new__",
      newCustomerName: "Anna Maria Lopez",
      newCustomerPhone: "780-555-0142",
      newCustomerEmail: "Anna@Example.com",
      newCustomerSmsOk: "on",
      assetId: "__new__",
      newDeviceType: "Phone",
      newDeviceMake: "Apple",
      newDeviceModel: "iPhone 14",
      newDeviceSerial: "SN1",
      newDevicePassword: "1234",
      problemType: "Screen Repair",
      subject: "Apple iPhone 14 — Screen Repair",
      quotedPrice: "120.50",
      inspectionFee: "15",
      termsAccepted: "on",
      priority: "HIGH",
      assignedToId: "usr_1",
      promisedAt: new Date("2026-10-04T17:00").toISOString(),
      locationId: "loc_2",
      checklistTemplateId: "chk_1",
      diagnosticNotes: "Dropped on tile",
    });
  });

  it("posts an existing customer and a saved device by id, with a warranty claim", () => {
    const values = fieldValues({ ...ready(), assetId: "ast_1", isWarranty: true, warrantyLineId: "line_1" }, ctx);
    expect(values).toMatchObject({ customerId: "cus_1", assetId: "ast_1", warrantyInvoiceLineId: "line_1" });
    expect(Object.keys(values)).not.toContain("newCustomerName");
    expect(Object.keys(values)).not.toContain("newDeviceType");
  });

  it("posts the defaults the server expects when nothing else was touched", () => {
    expect(fieldValues(ready(), ctx)).toEqual({
      customerId: "cus_1",
      assetId: "none",
      problemType: "Screen Repair",
      subject: "Screen Repair",
      quotedPrice: "",
      inspectionFee: "",
      priority: "NORMAL",
      assignedToId: "none",
      promisedAt: "",
      diagnosticNotes: "",
    });
  });

  it("leaves out a location when there is one branch and a checklist when there are none, as the old form did", () => {
    const values = fieldValues({ ...ready(), locationId: "loc_1", checklistTemplateId: AUTO }, ctx);
    expect(Object.keys(values)).not.toContain("locationId");
    expect(Object.keys(values)).not.toContain("checklistTemplateId");
    expect(fieldValues(ready(), full)).toMatchObject({ checklistTemplateId: "auto" });
  });

  it("posts a phone-only customer, without text consent when there is no number", () => {
    const phoneOnly = { ...initialState(), customerId: NEW, newCustomer: { name: "", phone: "5125550199", email: "", smsOk: true } };
    expect(fieldValues(phoneOnly, ctx)).toMatchObject({ newCustomerName: "", newCustomerPhone: "5125550199", newCustomerSmsOk: "on" });
    const nameOnly = { ...initialState(), customerId: NEW, newCustomer: { name: "Sam Lee", phone: "", email: "", smsOk: true } };
    expect(Object.keys(fieldValues(nameOnly, ctx))).not.toContain("newCustomerSmsOk");
  });

  it("saves an 'Other' device with no description as 'Other', and a typed one as typed", () => {
    expect(fieldValues(withDeviceKind(ready(), "Other", []), ctx).newDeviceType).toBe("Other");
    const typed = withDeviceKind(ready(), "Other", []);
    expect(fieldValues({ ...typed, device: { ...typed.device, type: "Printer" } }, ctx).newDeviceType).toBe("Printer");
    expect(fieldValues({ ...typed, device: { ...typed.device, type: "   " } }, ctx).newDeviceType).toBe("Other");
  });

  it("builds a real FormData the action can read", () => {
    const data = toFormData(fieldValues(ready({ quotedPrice: "99" }), ctx));
    expect(data.get("customerId")).toBe("cus_1");
    expect(data.get("quotedPrice")).toBe("99");
    expect(data.get("status")).toBeNull();
  });
});
