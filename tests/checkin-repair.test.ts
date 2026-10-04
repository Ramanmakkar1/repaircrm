import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The steps only draw; nothing here submits.
vi.mock("@/app/(app)/tickets/actions", () => ({ createTicketAction: vi.fn() }));

import { CustomerStep } from "@/components/tickets/intake/step-customer";
import { DetailsStep } from "@/components/tickets/intake/step-details";
import { DeviceStep } from "@/components/tickets/intake/step-device";
import { ProblemStep } from "@/components/tickets/intake/step-problem";
import { MobileBar } from "@/components/tickets/intake/summary";
import {
  NEW,
  advanceDevice,
  deviceChosen,
  deviceNextLabel,
  deviceSummary,
  fieldValues,
  initialState,
  isBlankNewDevice,
  stepMessage,
  stepStatus,
  summaryRows,
  toFormData,
  validate,
  withDeviceKind,
  withDeviceType,
  withDifferentDevice,
  withMake,
  withNoDevice,
  withSavedDevice,
  type CheckInContext,
  type CheckInState,
  type Issue,
} from "@/components/tickets/intake/flow";

const ctx: CheckInContext = {
  customers: [
    { id: "cus_1", label: "Elena Marquez", mobile: "512-555-0101" },
    { id: "cus_2", label: "Daniel Brooks", phone: "512-555-0145" },
  ],
  assetsByCustomer: {
    cus_1: [{ value: "ast_1", label: "Apple iPhone 14 Pro · Phone · F2LX7A", type: "Phone", make: "Apple", model: "iPhone 14 Pro" }],
    cus_2: [],
  },
  warrantiesByCustomer: {},
  techs: [],
  problemTypes: ["Hardware", "Screen", "Other"],
  locations: [],
  checklists: [],
};

const NEW_DEVICE_FIELDS = ["newDeviceType", "newDeviceMake", "newDeviceModel", "newDeviceSerial", "newDevicePassword"];

function ready(patch: Partial<CheckInState> = {}): CheckInState {
  return { ...initialState({ customerId: "cus_1" }), problemType: "Screen Repair", ...patch };
}

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
function render(Step: React.ComponentType<never>, state: CheckInState, issues: Issue[] = []) {
  return renderToStaticMarkup(createElement(Step, { state, ctx, setState: noop, onChosen: noop, onAdvance: noop, onNext: noop, issues } as never));
}

describe("'Different device' with nothing entered is not a device", () => {
  const blank = withDifferentDevice(ready());

  it("is recognised only while nothing has been entered", () => {
    expect(isBlankNewDevice(blank)).toBe(true);
    expect(isBlankNewDevice(withDeviceKind(blank, "Phone", []))).toBe(false);
    // The "Other" tile is a choice, even with no description.
    expect(isBlankNewDevice(withDeviceKind(blank, "Other", []))).toBe(false);
    expect(isBlankNewDevice(withNoDevice(blank))).toBe(false);
    expect(isBlankNewDevice(withSavedDevice(blank, "ast_1"))).toBe(false);
    expect(isBlankNewDevice(ready())).toBe(false);
  });

  it("posts 'none' and none of the new-device fields, so no junk 'Other' device is created", () => {
    const values = fieldValues(blank, ctx);
    expect(values.assetId).toBe("none");
    for (const name of NEW_DEVICE_FIELDS) expect(Object.keys(values), name).not.toContain(name);
    const data = toFormData(values);
    expect(data.get("assetId")).toBe("none");
    expect(data.get("newDeviceType")).toBeNull();
    // Same as never having visited the device step.
    expect(fieldValues(ready(), ctx)).toEqual(values);
  });

  it("is not a validation problem, and does not tick the step", () => {
    expect(validate(blank, ctx)).toEqual([]);
    expect(deviceChosen(blank)).toBe(false);
    expect(stepStatus(blank, ctx, 1)).toEqual({ done: false, text: "" });
    expect(deviceSummary(blank, ctx)).toBe("");
    expect(summaryRows(blank, ctx)[1]).toMatchObject({ label: "Device", value: "", empty: "Optional" });
  });

  it("says Skip on the button, and Next (or a tap on a stepper) leaves with 'No device'", () => {
    expect(deviceNextLabel(blank)).toBe("Skip, I'll add it later");
    const next = advanceDevice(blank);
    expect(next.leave).toBe(true);
    expect(next.state.assetId).toBe("none");
    expect(deviceSummary(next.state, ctx)).toBe("No device");
    expect(stepStatus(next.state, ctx, 1)).toEqual({ done: true, text: "No device" });
  });

  it("still posts a real new device: a kind alone is enough, and so is 'Other'", () => {
    const phone = fieldValues(withDeviceKind(blank, "Phone", []), ctx);
    expect(phone).toMatchObject({ assetId: "__new__", newDeviceType: "Phone", newDeviceMake: "", newDeviceModel: "" });
    for (const name of NEW_DEVICE_FIELDS) expect(Object.keys(phone), name).toContain(name);
    expect(fieldValues(withDeviceKind(blank, "Other", []), ctx)).toMatchObject({ assetId: "__new__", newDeviceType: "Other" });
    // A serial typed with no kind (not reachable from the screen) is kept rather than dropped.
    const serialOnly = { ...blank, device: { ...blank.device, serial: "SN1" } };
    expect(fieldValues(serialOnly, ctx)).toMatchObject({ assetId: "__new__", newDeviceType: "Other", newDeviceSerial: "SN1" });
  });

  it("emptying the 'what is it?' box of an Other device keeps it an Other device, not a blank one", () => {
    const typed = withDeviceType(withDeviceKind(blank, "Other", []), "Printer", []);
    expect(typed.device.type).toBe("Printer");
    const cleared = withDeviceType(typed, "", []);
    expect(cleared.device.type).toBe("Other");
    expect(isBlankNewDevice(cleared)).toBe(false);
    expect(fieldValues(cleared, ctx)).toMatchObject({ assetId: "__new__", newDeviceType: "Other" });
    // A model chosen on the way is not lost either.
    expect(withDeviceType(withMake(withDeviceKind(blank, "Other", []), "Acme"), "Camera", []).device).toMatchObject({ type: "Camera", make: "Acme" });
  });
});

describe("the message for a step", () => {
  const issues: Issue[] = [
    { step: 2, field: "problemType", message: "Choose what's wrong first." },
    { step: 3, field: "quotedPrice", message: "Enter a price from 0 to 1,000,000." },
  ];

  it("is the first one for that step, or null", () => {
    expect(stepMessage(issues, 2)).toBe("Choose what's wrong first.");
    expect(stepMessage(issues, 3)).toBe("Enter a price from 0 to 1,000,000.");
    expect(stepMessage(issues, 0)).toBeNull();
    expect(stepMessage([], 2)).toBeNull();
  });
});

describe("a step's message sits at the top, above the tiles, where a phone shows it", () => {
  const message = (step: number, field: string): Issue[] => [{ step, field, message: "PLAIN WORDS" }];

  it("3 Problem: before the first tile", () => {
    const html = render(ProblemStep, ready({ problemType: "" }), message(2, "problemType"));
    expect(html).toContain('role="alert"');
    expect(html).toContain("data-issues");
    expect(html.indexOf("PLAIN WORDS")).toBeGreaterThan(-1);
    expect(html.indexOf("PLAIN WORDS")).toBeLessThan(html.indexOf('aria-label="Problems"'));
    // No device chosen, so the shop's own list leads: "Hardware" is the first tile.
    expect(html.indexOf("PLAIN WORDS")).toBeLessThan(html.indexOf("Hardware"));
  });

  it("3 Problem: nothing at all when there is nothing to say", () => {
    const html = render(ProblemStep, ready({ problemType: "" }));
    expect(html).not.toContain('role="alert"');
  });

  it("2 Device: before the saved devices, and before the kinds", () => {
    const saved = render(DeviceStep, initialState({ customerId: "cus_1" }), message(1, "newDeviceType"));
    expect(saved.indexOf("PLAIN WORDS")).toBeGreaterThan(-1);
    expect(saved.indexOf("PLAIN WORDS")).toBeLessThan(saved.indexOf('aria-label="Saved devices"'));
    const kinds = render(DeviceStep, withDifferentDevice(initialState({ customerId: "cus_2" })), message(1, "newDeviceType"));
    expect(kinds.indexOf("PLAIN WORDS")).toBeGreaterThan(-1);
    expect(kinds.indexOf("PLAIN WORDS")).toBeLessThan(kinds.indexOf('aria-label="Kind of device"'));
    const brand = render(DeviceStep, withDeviceKind(initialState({ customerId: "cus_2" }), "Phone", []), message(1, "newDeviceMake"));
    expect(brand.indexOf("PLAIN WORDS")).toBeLessThan(brand.indexOf("Which brand?"));
  });

  it("1 Customer: before the search box, and before the new-customer fields", () => {
    const search = render(CustomerStep, initialState(), message(0, "customerId"));
    expect(search.indexOf("PLAIN WORDS")).toBeGreaterThan(-1);
    expect(search.indexOf("PLAIN WORDS")).toBeLessThan(search.indexOf('id="ci-search"'));
    const adding = render(CustomerStep, { ...initialState(), customerId: NEW }, message(0, "newCustomerName"));
    expect(adding.indexOf("PLAIN WORDS")).toBeGreaterThan(-1);
    expect(adding.indexOf("PLAIN WORDS")).toBeLessThan(adding.indexOf('id="ci-new-name"'));
  });

  it("scrolls clear of the fixed bars when brought into view", () => {
    const html = render(ProblemStep, ready({ problemType: "" }), message(2, "problemType"));
    expect(html).toMatch(/class="[^"]*\bscroll-mt-\d+\b[^"]*\bscroll-mb-\d+\b/);
  });
});

describe("4 Details: a refused inspection fee is never hidden", () => {
  const feeIssue: Issue[] = [{ step: 3, field: "inspectionFee", message: "Enter a price from 0 to 1,000,000." }];

  it("opens 'More options' by itself so the message shows", () => {
    const html = render(DetailsStep, ready({ inspectionFee: "-3" }), feeIssue);
    expect(text(html)).toContain("Enter a price from 0 to 1,000,000.");
    expect(html).toContain('id="ci-fee"');
    expect(html).toMatch(/aria-expanded="true"[^>]*>\s*<span>More options/);
  });

  it("leaves 'More options' closed when the fee is fine", () => {
    const html = render(DetailsStep, ready({ inspectionFee: "5" }), []);
    expect(html).not.toContain('id="ci-fee"');
    expect(html).toMatch(/aria-expanded="false"[^>]*>\s*<span>More options/);
  });

  it("shows a refused quote next to the price", () => {
    const html = render(DetailsStep, ready({ quotedPrice: "-1" }), [{ step: 3, field: "quotedPrice", message: "Enter a price from 0 to 1,000,000." }]);
    expect(html).toContain('aria-invalid="true"');
    expect(text(html)).toContain("Enter a price from 0 to 1,000,000.");
  });
});

describe("the phone's bar says why Next did nothing", () => {
  const bar = (props: Partial<React.ComponentProps<typeof MobileBar>> = {}) =>
    renderToStaticMarkup(createElement(MobileBar, { step: 2, line: "Elena Marquez", reason: "Choose what's wrong first.", pending: false, onNext: noop, ...props }));

  it("shows the chosen things when nothing was refused", () => {
    const html = bar();
    expect(text(html)).toContain("Elena Marquez");
    expect(text(html)).not.toContain("Choose what's wrong first.");
    expect(html).not.toContain("text-destructive");
  });

  it("shows the message in place of the line, in the warning colour, once Next was refused", () => {
    const html = bar({ warning: "Choose what's wrong first." });
    expect(text(html)).toContain("Choose what's wrong first.");
    expect(text(html)).not.toContain("Elena Marquez");
    expect(html).toContain("text-destructive");
    expect(text(html)).toContain("Next");
  });

  it("on the last step shows what is in the way of checking in, as before", () => {
    const html = bar({ step: 3, line: "x" });
    expect(text(html)).toContain("Choose what's wrong first.");
    expect(html).toContain("text-destructive");
    expect(text(html)).toContain("Check in repair");
    expect(text(bar({ step: 3, reason: null, line: "Elena Marquez · Screen Repair" }))).toContain("Elena Marquez · Screen Repair");
  });

  it("a long message wraps to two lines instead of being cut off", () => {
    const html = bar({ warning: "That email address does not look right. Fix it or leave it blank." });
    expect(html).toContain("line-clamp-2");
  });
});
