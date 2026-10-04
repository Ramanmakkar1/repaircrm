import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The flow only needs the action to exist; nothing here submits it.
vi.mock("@/app/(app)/appointments/actions", () => ({ saveAppointmentAction: vi.fn() }));

const { AppointmentDialog } = await import("@/components/appointments/appointment-dialog");
const { BookingDialog, BookingFlow } = await import("@/components/appointments/booking/booking-dialog");
const { WhoStep } = await import("@/components/appointments/booking/step-who");
const { WhenStep } = await import("@/components/appointments/booking/step-when");
const { WhatStep } = await import("@/components/appointments/booking/step-what");
const { SummaryStrip } = await import("@/components/appointments/booking/summary");
const { Stepper } = await import("@/components/appointments/booking/stepper");
const flow = await import("@/components/appointments/booking/flow");

import type { AppointmentFormValues, AppointmentPickers } from "@/components/appointments/appointment-state";

const now = new Date(2026, 9, 3, 14, 20);

const pickers: AppointmentPickers = {
  customers: [
    { value: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145" },
    { value: "cus_2", label: "Elena Marquez" },
    { value: "cus_3", label: "Okonkwo Dental" },
    { value: "cus_4", label: "Priya Shah" },
    { value: "cus_5", label: "Quinn Ortiz" },
  ],
  ticketsByCustomer: { cus_1: [{ value: "tkt_1", label: "#1042 · Cracked screen" }] },
  techs: [{ value: "usr_1", label: "Dana Ortiz" }],
  locations: [{ value: "loc_1", label: "Main" }],
};

const blank: AppointmentFormValues = {
  id: null,
  title: "",
  customerId: "",
  ticketId: "none",
  assignedToId: "none",
  locationId: "none",
  startDate: "2026-10-03",
  startTime: "15:00",
  duration: "60",
  endTime: "16:00",
  notes: "",
  reminderSentLabel: null,
};

const existing: AppointmentFormValues = {
  ...blank,
  id: "appt_1",
  title: "Screen swap drop-off",
  customerId: "cus_1",
  ticketId: "tkt_1",
  assignedToId: "usr_1",
  startDate: "2026-10-06",
  startTime: "10:30",
  duration: "90",
  endTime: "12:00",
  notes: "Bringing the charger too.",
  reminderSentLabel: "Oct 5, 9:14 AM",
};

const noop = () => {};
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const draw = (values: AppointmentFormValues, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(BookingFlow, { values, pickers, onSaved: noop, onCancel: noop, now, ...extra } as never));
const pressed = (html: string, label: string) =>
  new RegExp(`<button[^>]*aria-pressed="true"[^>]*>(?:(?!</button>)[\\s\\S])*${label}`).test(html);

describe("Book a visit, first paint of a new booking", () => {
  const html = draw(blank);

  it("opens on Who, with the three steps in a row and the first one current", () => {
    expect(text(html)).toContain("Who is coming in?");
    const current = html.match(/<button[^>]*aria-current="step"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(text(current)).toContain("Who");
    const steps = html.match(/<nav aria-label="Booking steps">[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(text(steps)).toMatch(/Who.*When.*What for/);
  });

  it("shows the big search, the New customer box and customers to tap", () => {
    expect(html).toContain('placeholder="Name or phone number"');
    expect(text(html)).toContain("New customer");
    expect(text(html)).toContain("Just a name or a phone number");
    expect(text(html)).toContain("Or tap a customer");
    expect(text(html)).toContain("Daniel Brooks");
    expect(text(html)).toContain("(512) 555-0145");
    // Four to tap, then a nudge to type: a tablet should not scroll for this.
    expect(text(html)).toContain("Start typing to find anyone else.");
    expect(text(html)).not.toContain("Quinn Ortiz");
  });

  it("has a live Who - When - What strip", () => {
    const strip = html.match(/<div role="group" aria-label="This visit"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? html;
    expect(text(strip)).toContain("Walk-in");
    expect(strip).toContain('aria-label="When: Today, 3–4 PM. Change"');
    expect(text(strip)).toContain("3–4 PM");
    expect(text(strip)).toContain("Not chosen");
  });

  it("has ONE primary action: Skip on the first step, and no Book visit yet", () => {
    expect(text(html)).toContain("Skip, walk-in");
    expect(text(html)).not.toContain("Book visit");
    expect(text(html)).not.toContain("Save changes");
    // Cancel is a quiet ghost button; the only filled black button is the primary.
    expect(html.match(/bg-accent text-accent-foreground shadow-xs/g)).toHaveLength(1);
  });

  it("keeps the old Full-mode wording out of Easy mode", () => {
    expect(text(html)).not.toMatch(/ticket/i);
    expect(text(html)).not.toContain("New Appointment");
  });
});

describe("Book a visit, editing", () => {
  const html = draw(existing);

  it("opens on When and says Save changes on every step", () => {
    expect(text(html)).toContain("When?");
    expect(text(html)).toContain("Save changes");
    expect(text(html)).not.toContain("Book visit");
    expect(text(html)).not.toContain("Next:");
  });

  it("shows what it is now in the strip, and the reminder that already went out", () => {
    expect(text(html)).toContain("Daniel Brooks");
    expect(html).toContain('aria-label="When: Tue, Oct 6, 10:30 AM – 12 PM. Change"');
    expect(text(html)).toContain("Screen swap drop-off");
    expect(text(html)).toContain("Reminder sent Oct 5, 9:14 AM");
  });

  it("starts on the step that moves it, with its current time chosen", () => {
    expect(html).toContain('value="2026-10-06"');
    expect(html).toContain('value="10:30"');
    // 90 minutes is behind "Longer", which therefore starts open and chosen.
    expect(pressed(html, "1½ hours")).toBe(true);
    expect(pressed(html, "Longer")).toBe(true);
  });
});

describe("the When step", () => {
  const draw1 = (values: AppointmentFormValues) =>
    renderToStaticMarkup(createElement(WhenStep, { values, change: noop, now, issues: [] } as never));

  it("has day tiles with their dates, a date picker, time tiles, a custom time and duration chips", () => {
    const html = draw1(blank);
    for (const label of ["Today", "Tomorrow", "Next week", "Sat, Oct 3", "Sun, Oct 4", "Sat, Oct 10"]) {
      expect(text(html)).toContain(label);
    }
    expect(html).toContain('type="date"');
    expect(html).toContain('type="time"');
    for (const label of ["8 AM", "12 PM", "7 PM", "15 min", "30 min", "60 min", "Longer"]) {
      expect(text(html)).toContain(label);
    }
    expect(text(html)).toContain("Ends at 4 PM");
  });

  it("marks the chosen day, time and length, and says so with aria-pressed", () => {
    const html = draw1(blank);
    expect(pressed(html, "Today")).toBe(true);
    expect(pressed(html, "3 PM")).toBe(true);
    expect(pressed(html, "60 min")).toBe(true);
    expect(pressed(html, "Tomorrow")).toBe(false);
    expect(pressed(html, "9 AM")).toBe(false);
  });

  it("asks for an end time only when the end is custom", () => {
    expect(draw1(blank)).not.toContain('id="bk-end"');
    const custom = draw1({ ...blank, duration: "custom", endTime: "17:30" });
    expect(custom).toContain('id="bk-end"');
    expect(custom).toContain('value="17:30"');
    expect(pressed(custom, "End time")).toBe(true);
  });

  it("shows the step's own message when something is wrong", () => {
    const html = renderToStaticMarkup(
      createElement(WhenStep, { values: blank, change: noop, now, issues: [{ step: 1, field: "startTime", message: "Pick a start date and time." }] } as never),
    );
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Pick a start date and time.");
  });
});

describe("the What for step", () => {
  const ctx = pickers;
  const drawWhat = (values: AppointmentFormValues, kind: string, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(WhatStep, { values, kind, ctx, setValues: noop, change: noop, onKind: noop, more: false, onMore: noop, issues: [], ...extra } as never),
    );

  it("has the five picture tiles, each a real button with its photo on a white canvas", () => {
    const html = drawWhat(blank, "");
    for (const label of ["Drop-off", "Pick-up", "Quote", "Repair check-in", "Other"]) expect(text(html)).toContain(label);
    for (const photo of ["phone", "pickup-bag", "price-tag", "toolbox", "diary"]) expect(html).toContain(photo);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5);
    expect(html).toContain("bg-white");
  });

  it("marks the chosen box", () => {
    const html = drawWhat({ ...blank, title: "Quote" }, "quote");
    expect(pressed(html, "Quote")).toBe(true);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("keeps the title, the linked repair, the technician, the location and the notes behind More options", () => {
    const closed = drawWhat(blank, "");
    expect(text(closed)).toContain("More options");
    expect(closed).toContain('aria-expanded="false"');
    for (const id of ["bk-title", "bk-ticket", "bk-tech", "bk-location", "bk-notes"]) expect(closed).not.toContain(`id="${id}"`);

    const open = drawWhat({ ...existing, customerId: "cus_1" }, "other", { more: true });
    expect(open).toContain('aria-expanded="true"');
    for (const id of ["bk-ticket", "bk-tech", "bk-location", "bk-notes"]) expect(open).toContain(`id="${id}"`);
    // "Other" asks for the words right under the tiles, so the title is not asked for twice.
    expect(open).toContain('id="bk-title-other"');
    expect(open).not.toContain('id="bk-title"');
    expect(text(open)).toContain("Linked repair");
    expect(open).toContain("Screen swap drop-off");
    expect(open).toContain("Bringing the charger too.");
  });

  it("shows the title field in More options when a box has written it", () => {
    const html = drawWhat({ ...blank, title: "Drop-off" }, "dropoff", { more: true });
    expect(html).toContain('id="bk-title"');
    expect(html).not.toContain('id="bk-title-other"');
  });

  it("hides a location picker when the shop has no locations, but still has the technician", () => {
    const html = drawWhat(blank, "", { more: true, ctx: { ...ctx, locations: [] } });
    expect(html).not.toContain('id="bk-location"');
    expect(html).toContain('id="bk-tech"');
  });

  it("explains a disabled repair picker in words", () => {
    expect(text(drawWhat(blank, "", { more: true }))).toContain("Choose a customer to link one of their repairs.");
    expect(text(drawWhat({ ...blank, customerId: "cus_2" }, "", { more: true }))).toContain("No repairs on file for them.");
  });
});

describe("the Who step", () => {
  const drawWho = (values: AppointmentFormValues, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(WhoStep, { values, ctx: pickers, setValues: noop, onChosen: noop, issues: [], focusSearch: false, ...extra } as never),
    );

  it("shows the chosen customer with a Change button", () => {
    const html = drawWho({ ...blank, customerId: "cus_2" });
    expect(text(html)).toContain("Elena Marquez");
    expect(text(html)).toContain("Change");
    expect(html).not.toContain("bk-search");
  });

  it("asks a new customer for a name or a number, with the text-message consent kept", () => {
    const html = drawWho({ ...blank, customerId: "new", newCustomerPhone: "780-555-0142" });
    expect(text(html)).toContain("New customer");
    expect(html).toContain('id="bk-new-name"');
    expect(html).toContain('id="bk-new-phone"');
    expect(html).toContain('value="780-555-0142"');
    expect(text(html)).toContain("A name or a phone number is enough.");
    expect(text(html)).toContain("They’re happy to get texts about this booking and their repair");
    expect(text(html)).toContain("They get a confirmation text now and a reminder before the visit.");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(text(html)).toContain("Search instead");
  });

  it("disables the text box until there is a number to text", () => {
    const html = drawWho({ ...blank, customerId: "new", newCustomerName: "Dana" });
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/);
    expect(text(html)).toContain("Add a mobile number to text them.");
  });

  it("opens the email box when an address was already typed", () => {
    expect(drawWho({ ...blank, customerId: "new", newCustomerEmail: "dana@example.com", newCustomerName: "Dana" })).toContain('id="bk-new-email"');
    expect(drawWho({ ...blank, customerId: "new", newCustomerName: "Dana" })).not.toContain('id="bk-new-email"');
  });
});

describe("the strip and the stepper", () => {
  it("makes every part of the strip a 56px-plus tap that names its step", () => {
    const html = renderToStaticMarkup(
      createElement(SummaryStrip, { parts: flow.summaryParts(existing, pickers, now), onStep: noop }),
    );
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain("min-h-14");
    expect(html).toContain('aria-label="Who: Daniel Brooks. Change"');
  });

  it("ticks a finished step and says so in words for a screen reader", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { step: 1, done: [true, true, false], onStep: noop }));
    expect(html).toContain("(done)");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });
});

describe("Easy and Full mode", () => {
  it("Easy mode gets the new flow, Full mode keeps its own dialog", () => {
    const props = { open: true, onOpenChange: noop, values: blank, pickers };
    expect((AppointmentDialog({ ...props, simple: true }) as { type: unknown }).type).toBe(BookingDialog);
    const full = AppointmentDialog({ ...props, simple: false }) as { type: unknown };
    expect(full.type).not.toBe(BookingDialog);
    expect((AppointmentDialog(props) as { type: unknown }).type).not.toBe(BookingDialog);
  });
});

describe("the booking files stay on the theme", () => {
  const dir = new URL("../components/appointments/booking/", import.meta.url);
  const sources = readdirSync(dir)
    .filter((file) => /\.(tsx?|ts)$/.test(file))
    .map((file) => [file, readFileSync(new URL(file, dir), "utf8")] as const);

  it("uses no hex colours, and bg-white only as the photo's canvas", () => {
    for (const [file, source] of sources) {
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      const whites = source.match(/bg-white/g) ?? [];
      if (file !== "tiles.tsx") expect(whites, file).toHaveLength(0);
      else expect(whites).toHaveLength(1);
    }
  });

  it("has no coloured side stripes", () => {
    for (const [file, source] of sources) expect(source, file).not.toMatch(/\bborder-[lrtb]-[2-9]\b/);
  });
});
