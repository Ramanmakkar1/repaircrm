import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form only needs the action to exist; nothing here submits it.
vi.mock("@/app/(app)/tickets/actions", () => ({ createTicketAction: vi.fn() }));

import { TicketForm } from "@/components/tickets/ticket-form";
import { CustomerStep } from "@/components/tickets/intake/step-customer";
import { DetailsStep } from "@/components/tickets/intake/step-details";
import { DeviceStep } from "@/components/tickets/intake/step-device";
import { ProblemStep } from "@/components/tickets/intake/step-problem";
import { Stepper } from "@/components/tickets/intake/stepper";
import { MobileBar, SummaryPanel } from "@/components/tickets/intake/summary";
import {
  NEW,
  initialState,
  stepStatus,
  summaryRows,
  withDeviceKind,
  withMake,
  withNoDevice,
  withProblem,
  withSavedDevice,
  type CheckInContext,
  type CheckInState,
} from "@/components/tickets/intake/flow";

const ctx: CheckInContext = {
  customers: [
    { id: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145" },
    { id: "cus_2", label: "Elena Marquez", mobile: "512-555-0101" },
  ],
  assetsByCustomer: {
    cus_1: [
      { value: "ast_1", label: "Dell Latitude 5420 · Laptop · JK4LM72", type: "Laptop", make: "Dell", model: "Latitude 5420" },
      { value: "ast_2", label: "Desktop", type: "Desktop" },
    ],
    cus_2: [],
  },
  warrantiesByCustomer: { cus_1: [{ value: "line_1", label: "Screen", hint: "Invoice #7 · expires Nov 3" }] },
  techs: [{ value: "usr_1", label: "Dana Ortiz" }, { value: "usr_2", label: "Marcus Webb" }],
  problemTypes: ["Hardware", "Screen", "Other"],
  locations: [{ value: "loc_1", label: "Main" }, { value: "loc_2", label: "Mall" }],
  checklists: [{ value: "chk_1", label: "Screen checklist" }],
};

const noop = () => {};
const baseProps = { customers: ctx.customers, assetsByCustomer: ctx.assetsByCustomer, techs: ctx.techs, problemTypes: ctx.problemTypes };
const easy = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(TicketForm, { ...baseProps, simple: true, ...extra } as never));
const names = (html: string) => [...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"/g)].map((match) => match[1]);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const step = (html: string) => html.match(/<button[^>]*aria-current="step"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

function render(Step: React.ComponentType<never>, state: CheckInState, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(Step, { state, ctx, setState: noop, onChosen: noop, onAdvance: noop, onNext: noop, issues: [], ...extra } as never));
}

describe("Easy-mode check-in, first paint", () => {
  const html = easy();

  it("opens on 1 Customer with a big search box and a New customer box", () => {
    expect(text(html)).toContain("Who is this for?");
    expect(html).toContain('placeholder="Name or phone number"');
    expect(html).toContain("autofocus"); // React writes the attribute lower-case in static markup
    expect(text(html)).toContain("New customer");
    expect(text(html)).toContain("Just a name or a phone number");
  });

  it("shows the four steps, the current one by aria-current as well as fill", () => {
    for (const label of ["Customer", "Device", "Problem", "Details"]) expect(text(html)).toContain(label);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(step(html)).toContain("bg-accent");
    expect(text(step(html))).toContain("Customer");
  });

  it("has 'This repair' with a row and a Change for each of five things", () => {
    const side = html.slice(html.indexOf('aria-label="This repair"'));
    for (const label of ["Customer", "Device", "Problem", "Price", "Promised"]) expect(text(side)).toContain(label);
    expect(side.match(/aria-label="Change (customer|device|problem|price|promised)"/g)).toHaveLength(5);
  });

  it("explains why it can't check in yet, and the button says so to assistive technology", () => {
    expect(text(html)).toContain("Choose a customer first.");
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('aria-describedby="ci-reason"');
    expect(text(html)).toContain("Check in repair");
  });

  it("is a no-validate form, with the pre-built Enter handling, and drops the old one-screen toggle", () => {
    expect(html.match(/<form[^>]*>/)?.[0]).toMatch(/novalidate/i);
    expect(text(html)).not.toContain("Use step-by-step");
    expect(text(html)).not.toContain("Use quick entry");
  });

  it("posts the same defaults the old form did, with nothing for a customer who is not new", () => {
    expect(names(html)).toEqual(["customerId", "assetId", "problemType", "subject", "quotedPrice", "inspectionFee", "priority", "assignedToId", "promisedAt", "diagnosticNotes"]);
    expect(html).toContain('name="assetId" value="none"');
    expect(html).toContain('name="priority" value="NORMAL"');
  });

  it("has the phone's bar: one line and a Next button, hidden from the large layout up", () => {
    const bar = html.slice(html.indexOf('role="region"'));
    expect(text(bar)).toContain("Step 1 of 4");
    expect(text(bar)).toContain("Nothing chosen yet");
    expect(bar).toMatch(/class="[^"]*\blg:hidden\b/);
    expect(text(bar)).toContain("Next");
  });

  it("asks for the location and checklist only when the shop has them", () => {
    const withBranches = easy({ locations: ctx.locations, defaultLocationId: "loc_2", checklists: ctx.checklists });
    expect(names(withBranches)).toEqual(expect.arrayContaining(["locationId", "checklistTemplateId"]));
    expect(withBranches).toContain('name="locationId" value="loc_2"');
    expect(withBranches).toContain('name="checklistTemplateId" value="auto"');
  });
});

describe("Easy-mode check-in, opened for a customer", () => {
  const html = easy({ defaultCustomerId: "cus_1" });

  it("starts on 2 Device with the customer already chosen", () => {
    expect(text(html)).toContain("What are we fixing?");
    expect(text(step(html))).toContain("Device");
    expect(html).toContain('name="customerId" value="cus_1"');
    expect(text(html)).toContain("Daniel Brooks");
    // The first step is ticked and names who it is for.
    expect(text(html.slice(html.indexOf("Check-in steps"), html.indexOf("What are we fixing?")))).toContain("(done)");
  });

  it("shows the customer's saved devices as picture tiles first, with Different device and No device", () => {
    expect(text(html)).toContain("Daniel’s Dell Latitude 5420");
    expect(text(html)).toContain("Laptop · JK4LM72");
    expect(text(html)).toContain("Daniel’s Desktop");
    expect(text(html)).toContain("Different device");
    expect(text(html)).toContain("No device");
    expect(html).toContain("laptop.webp");
    expect(html).toContain("desktop-computer.webp");
    // The kinds are one tap further: they are not asked until "Different device".
    expect(text(html)).not.toContain("Game console");
  });
});

describe("1 Customer", () => {
  const state = initialState();

  it("lists matches as large rows with initials, name and number once something is typed (client-side), and offers New customer", () => {
    const html = render(CustomerStep, state);
    // Nothing typed yet: the most recent customers are one tap away, next to New customer.
    expect(text(html)).toContain("New customer");
    expect(text(html)).toContain("Or tap a customer");
    expect(text(html)).toContain("Daniel Brooks");
    expect(html).toContain("min-h-[4.5rem]");
  });

  it("shows a chosen customer with a Change button", () => {
    const html = render(CustomerStep, { ...state, customerId: "cus_2" });
    expect(text(html)).toContain("Elena Marquez");
    expect(text(html)).toContain("512-555-0101");
    expect(text(html)).toContain("Change");
    expect(text(html)).toContain("Next: Device");
    expect(html).toContain(">EM<");
  });

  it("asks a new customer for just a name and a number, with email behind a toggle", () => {
    const html = render(CustomerStep, { ...state, customerId: NEW });
    expect(html).toContain('placeholder="Full name"');
    expect(html).toContain('placeholder="Mobile number"');
    expect(text(html)).toContain("A name or a phone number is enough.");
    expect(html).not.toContain('type="email"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(/\bname="newCustomer/); // the typed-into inputs carry no name; hidden ones post
  });

  it("shows the plain message when a new customer has neither", () => {
    const html = render(CustomerStep, { ...state, customerId: NEW }, { issues: [{ step: 0, field: "newCustomerName", message: "Enter a name or a phone number." }] });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Enter a name or a phone number.");
  });
});

describe("2 Device", () => {
  const withCustomer = { ...initialState({ customerId: "cus_2" }) };

  it("shows the first seven kinds as picture tiles, then a More devices box (the standard list has more than eight)", () => {
    const html = render(DeviceStep, withDifferent(withCustomer));
    for (const label of ["Phone", "Tablet", "Laptop", "Computer", "Game console", "TV", "Watch"]) expect(text(html)).toContain(label);
    for (const photo of ["phone", "tablet", "laptop", "desktop-computer", "game-console", "television", "smartwatch"]) expect(html).toContain(`${photo}.webp`);
    expect(text(html)).toContain("More devices");
    expect(text(html)).toContain("No device");
    expect(text(html)).toContain("Skip, I'll add it later");
  });

  it("asks for the brand next, as tiles, skippable", () => {
    const html = render(DeviceStep, withDeviceKind(withCustomer, "Phone", ctx.problemTypes));
    for (const brand of ["Apple", "Samsung", "Google", "Motorola"]) expect(text(html)).toContain(brand);
    expect(text(html)).toContain("Type a different brand");
    expect(text(html)).toContain("Skip, I'll add it later");
    expect(text(html)).toContain("Change"); // the kind chosen so far, with a way back
  });

  it("asks for the model after that: chips, a plain field, and the serial and unlock code one toggle away", () => {
    const html = render(DeviceStep, withMake(withDeviceKind(withCustomer, "Phone", ctx.problemTypes), "Apple"));
    for (const model of ["iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16"]) expect(text(html)).toContain(model);
    expect(text(html)).toContain("Type a different model");
    expect(text(html)).toContain("More device details");
    expect(html).not.toContain("Unlock code"); // behind the toggle
    expect(text(html)).toContain("Skip, I'll add it later");
  });

  it("lets a TV have no model list, only the plain field", () => {
    const html = render(DeviceStep, withMake(withDeviceKind(withCustomer, "Television", ctx.problemTypes), "LG"));
    expect(html).not.toContain('aria-label="Models"');
    expect(text(html)).toContain("Type a different model");
  });

  it("asks what an Other device is, instead of listing brands", () => {
    const html = render(DeviceStep, withDeviceKind(withCustomer, "Other", ctx.problemTypes));
    expect(text(html)).toContain("What is it?");
    expect(text(html)).not.toContain("Which brand?");
  });

  it("marks the choice made, with aria-pressed", () => {
    const html = render(DeviceStep, { ...withNoDevice(withCustomer) });
    expect(html).toContain('aria-pressed="true"');
  });

  it("offers a way back to the saved devices when the customer has some", () => {
    const state = { ...initialState({ customerId: "cus_1" }), assetId: NEW };
    expect(text(render(DeviceStep, state))).toContain("Back to saved devices");
    expect(text(render(DeviceStep, withSavedDevice(state, "ast_1")))).toContain("Different device");
  });

  function withDifferent(state: CheckInState): CheckInState {
    return { ...state, assetId: NEW };
  }
});

describe("3 Problem", () => {
  const state = withDeviceKind(initialState({ customerId: "cus_2" }), "Phone", ctx.problemTypes);

  it("shows a box for each problem, the device's own first, then the shop's, then Other", () => {
    const html = render(ProblemStep, state);
    const labels = [...html.matchAll(/aria-pressed="(?:true|false)"[^>]*>.*?<span class="text-\[15px\][^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(["Screen Repair", "Battery Replacement", "Charging Port Repair", "Water Damage", "Software / Virus", "Diagnostic", "Hardware", "Other"]);
  });

  it("uses a picture where one fits and an icon in a soft square otherwise", () => {
    const html = render(ProblemStep, state);
    expect(html).toContain("display-assembly.webp");
    expect(html).toContain("phone-battery.webp");
    expect(html).toContain("charging-port.webp");
    expect(html).toContain("repair-tools.webp");
    expect(html).toContain("bg-surface-hover"); // the icon boxes
    expect(html).toContain("<svg");
  });

  it("marks the problem chosen, and keeps the title and notes one toggle away", () => {
    const html = render(ProblemStep, withProblem(state, "Screen Repair"));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(text(html)).toContain("Add a note or change the title");
    expect(html).toContain('aria-expanded="false"');
    expect(text(html)).toContain("Next: Details");
  });

  it("asks what 'Other' is", () => {
    const html = render(ProblemStep, withProblem(state, "Other Repair"));
    expect(text(html)).toContain("What is the problem?");
  });

  it("shows the plain message when nothing was chosen", () => {
    const html = render(ProblemStep, state, { issues: [{ step: 2, field: "problemType", message: "Choose what's wrong first." }] });
    expect(text(html)).toContain("Choose what's wrong first.");
  });
});

describe("4 Details", () => {
  const state = withProblem(withNoDevice(initialState({ customerId: "cus_1" })), "Screen Repair");

  it("has a big price field with a currency prefix, pickup tiles, three priorities, and who gets it", () => {
    const html = render(DetailsStep, state, { slaHint: "Leave blank and we'll promise 48 hours." });
    expect(html).toContain('type="number"');
    expect(html).toContain(">$<");
    for (const label of ["Today", "Tomorrow", "In 3 days", "Next week", "Pick a date"]) expect(text(html)).toContain(label);
    for (const label of ["Normal", "High", "Urgent"]) expect(text(html)).toContain(label);
    expect(text(html)).not.toContain("Low priority"); // behind More options
    for (const label of ["Unassigned", "Dana Ortiz", "Marcus Webb"]) expect(text(html)).toContain(label);
    expect(text(html)).toContain("Leave blank and we'll promise 48 hours.");
    expect(html).toContain('aria-expanded="false"');
    expect(text(html)).toContain("More options");
  });

  it("marks Normal and Unassigned as the defaults", () => {
    const html = render(DetailsStep, state);
    const pressed = [...html.matchAll(/aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim());
    expect(pressed).toEqual(["Normal", "Unassigned"]);
  });

  it("shows the date picker only after Pick a date", () => {
    expect(render(DetailsStep, state)).not.toContain('type="datetime-local"');
    expect(render(DetailsStep, { ...state, promised: { choice: "pick", local: "2026-10-04T17:00" } })).toContain('type="datetime-local"');
  });

  it("keeps the price rule's message next to the price", () => {
    const html = render(DetailsStep, { ...state, quotedPrice: "-5" }, { issues: [{ step: 3, field: "quotedPrice", message: "Enter a price from 0 to 1,000,000." }] });
    expect(text(html)).toContain("Enter a price from 0 to 1,000,000.");
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("the stepper and the summary", () => {
  const state = withProblem(withSavedDevice(initialState({ customerId: "cus_1" }), "ast_1"), "Screen Repair");
  const statuses = [0, 1, 2, 3].map((index) => stepStatus(state, ctx, index));

  it("ticks finished steps and names the choice, and only the current one is aria-current", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { step: 3, statuses, onStep: noop }));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(text(html)).toContain("Daniel Brooks");
    expect(text(html)).toContain("Dell Latitude 5420");
    expect(text(html)).toContain("Screen Repair");
    expect(text(html).match(/\(done\)/g)).toHaveLength(3);
  });

  it("is never locked: every step is a button", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { step: 0, statuses, onStep: noop }));
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toContain("disabled");
  });

  it("enables the big button when a customer and a problem are chosen", () => {
    const rows = summaryRows(state, ctx);
    const ready = renderToStaticMarkup(createElement(SummaryPanel, { rows, onChange: noop, reason: null, pending: false }));
    expect(ready).not.toContain("aria-disabled");
    expect(text(ready)).toContain("Check in repair");
    expect(text(ready)).toContain("Daniel Brooks");
    const blocked = renderToStaticMarkup(createElement(SummaryPanel, { rows, onChange: noop, reason: "Choose what's wrong first.", pending: false }));
    expect(blocked).toContain('aria-disabled="true"');
    expect(text(blocked)).toContain("Choose what's wrong first.");
  });

  it("shows Checking in… while it saves, and cannot be pressed twice", () => {
    const html = renderToStaticMarkup(createElement(SummaryPanel, { rows: summaryRows(state, ctx), onChange: noop, reason: null, pending: true }));
    expect(text(html)).toContain("Checking in…");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it("gives the phone Next on the way through and Check in repair on the last step", () => {
    const next = renderToStaticMarkup(createElement(MobileBar, { step: 1, line: "Daniel Brooks", reason: null, pending: false, onNext: noop }));
    expect(text(next)).toContain("Step 2 of 4");
    expect(text(next)).toContain("Next");
    expect(next).not.toContain('type="submit"');
    const last = renderToStaticMarkup(createElement(MobileBar, { step: 3, line: "Daniel Brooks", reason: "Choose what's wrong first.", pending: false, onNext: noop }));
    expect(text(last)).toContain("Check in repair");
    expect(text(last)).toContain("Choose what's wrong first.");
    expect(last).toContain('type="submit"');
  });
});

describe("Full mode is the form it always was", () => {
  const html = renderToStaticMarkup(createElement(TicketForm, { ...baseProps, simple: false } as never));

  it("still has the single form with its dropdowns and no stepper", () => {
    expect(text(html)).toContain("Problem type");
    expect(text(html)).toContain("Repair summary");
    expect(text(html)).toContain("Quoted price");
    expect(text(html)).toContain("Inspection fee");
    expect(html).not.toContain("Check-in steps");
    expect(html).not.toContain("This repair");
  });
});

describe("theme and touch rules for the new files", () => {
  const dir = "components/tickets/intake";
  const files = readdirSync(dir).filter((name) => /\.tsx?$/.test(name));
  const read = (name: string) => readFileSync(`${dir}/${name}`, "utf8");

  it("uses theme tokens only: no hex, no fixed colour classes", () => {
    for (const name of files) {
      const source = read(name).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, name).not.toMatch(/\b(?:bg-black|text-white|text-black|(?:bg|text|border)-(?:blue|zinc|gray|slate|red|green|amber)-\d+)\b/);
    }
  });

  it("uses bg-white only as the canvas behind a photo", () => {
    for (const name of files) {
      const rows = read(name).split("\n");
      const hits = rows.flatMap((line, index) => (/\bbg-white\b/.test(line) ? [index] : []));
      if (name === "tiles.tsx") expect(hits).toHaveLength(1);
      else expect(hits, name).toHaveLength(0);
      // The line after the white box is the photo that sits on it.
      for (const index of hits) expect(rows[index + 1]).toContain("<Image");
    }
  });

  it("has no coloured side-stripe borders", () => {
    for (const name of files) expect(read(name), name).not.toMatch(/\bborder-[lr]-(?:[2-9]|\[)/);
  });

  it("keeps every tile and button above 48px", () => {
    const tiles = read("tiles.tsx");
    expect(tiles).toMatch(/min-h-36/); // picture tiles
    expect(tiles).toMatch(/min-h-14/); // text tiles
    expect(tiles).toMatch(/min-h-12/); // chips and toggles
    expect(read("summary.tsx")).toMatch(/h-14/); // the big button
    expect(read("step-customer.tsx")).toMatch(/min-h-\[4\.5rem\]/);
  });
});
