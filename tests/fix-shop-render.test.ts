import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Nothing here presses a button: the actions only need to exist.
vi.mock("@/app/(app)/appointments/actions", () => ({
  deleteAppointmentAction: vi.fn(),
  saveAppointmentAction: vi.fn(),
  searchBookingCustomersAction: vi.fn(),
  setAppointmentStatusAction: vi.fn(),
}));
vi.mock("@/app/(app)/leads/actions", () => ({
  closeLeadAction: vi.fn(),
  convertLeadAction: vi.fn(),
  createLeadAction: vi.fn(),
  deleteLeadAction: vi.fn(),
  markContactedAction: vi.fn(),
  reopenLeadAction: vi.fn(),
  updateLeadAction: vi.fn(),
}));
vi.mock("@/app/(app)/marketing/actions", () => ({
  deleteCampaignAction: vi.fn(),
  setCampaignActiveAction: vi.fn(),
  syncAndSendAction: vi.fn(),
  syncCampaignAction: vi.fn(),
}));
vi.mock("@/app/(app)/time-clock/actions", () => ({
  clockInAction: vi.fn(),
  clockOutAction: vi.fn(),
  deleteTimeClockEntryAction: vi.fn(),
  updateTimeClockEntryAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const { dayAgenda, stripDays, weekGroups } = await import("@/components/appointments/agenda");
const { AppointmentCards } = await import("@/components/appointments/appointment-cards");
const { DayAgenda } = await import("@/components/appointments/day-agenda");
const { DayStrip } = await import("@/components/appointments/day-strip");
const { StaffChips } = await import("@/components/appointments/staff-chips");
const { visitMoment } = await import("@/components/appointments/card-meta");
const { BookingFlow } = await import("@/components/appointments/booking/booking-dialog");
const { initialStep, pickerLines, withFoundCustomers } = await import("@/components/appointments/booking/flow");
const { OwedCard } = await import("@/components/dashboard/owed-card");
const { NeedsYouSection } = await import("@/components/dashboard/needs-you");
const { AppointmentsCard } = await import("@/components/dashboard/coming-up");
const { TicketTile } = await import("@/components/display/ticket-tile");
const { StatusChip } = await import("@/components/display/status-chip");
const { CampaignFlow, MessagePreview } = await import("@/components/marketing/campaign-flow");
const { LeadForm } = await import("@/components/leads/lead-form");
const { LeadActions } = await import("@/components/leads/lead-actions");
const { ClockPanel } = await import("@/components/time-clock/clock-panel");

import type { CalendarAppointment } from "@/components/appointments/calendar-meta";
import type { AppointmentFormValues, AppointmentPickers } from "@/components/appointments/appointment-state";

const ZONE = "America/Edmonton";
const html = (element: React.ReactElement) => renderToStaticMarkup(element);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** A hex colour or a Tailwind palette colour: the app paints with theme tokens only. */
const RAW_COLOUR = /#[0-9a-fA-F]{6}\b|\b(?:bg|text|border|ring)-(?:red|green|blue|yellow|orange|amber|emerald|slate|gray|zinc|black)(?:-\d+)?\b/;

// Sunday Oct 4 2026, 12:17 PM in Edmonton.
const NOW = new Date("2026-10-04T18:17:00Z");

function visit(id: string, startIso: string, endIso: string, over: Partial<CalendarAppointment> = {}): CalendarAppointment {
  return {
    id,
    title: "Drop-off",
    notes: null,
    startsAt: new Date(startIso),
    endsAt: new Date(endIso),
    status: "SCHEDULED",
    customer: { id: "cus_1", firstName: "Daniel", lastName: "Brooks", businessName: null },
    ticket: null,
    assignedTo: { id: "usr_1", name: "Marcus Webb" },
    location: null,
    ...over,
  };
}

const week = Array.from({ length: 7 }, (_, index) => new Date(2026, 8, 28 + index));
const visits = [
  visit("mon", "2026-09-28T16:00:00Z", "2026-09-28T17:00:00Z", { status: "DONE" }),
  visit("past-today", "2026-10-04T17:00:00Z", "2026-10-04T17:30:00Z"),
  visit("next", "2026-10-04T21:00:00Z", "2026-10-04T22:00:00Z", { customer: { id: "cus_2", firstName: "Elena", lastName: "Marquez", businessName: null } }),
  // 8:30 PM Sunday in Edmonton is already Monday in UTC: it still belongs to Sunday.
  visit("late", "2026-10-05T02:30:00Z", "2026-10-05T03:00:00Z", { status: "CANCELED" }),
];

describe("Visits: the day strip", () => {
  const strip = stripDays({ days: week, appointments: visits, now: NOW, zone: ZONE, selectedKey: "2026-10-04" });

  it("counts each day's visits on the shop's calendar, leaving canceled ones out", () => {
    expect(strip.map((day) => day.visits)).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(strip[6]).toMatchObject({ key: "2026-10-04", label: "Today", isToday: true, selected: true });
    expect(strip[0]).toMatchObject({ label: "Mon", date: "Sep 28" });
  });

  it("is seven 72px links, today in words, the chosen day marked aria-current", () => {
    const markup = html(React.createElement(DayStrip, { days: strip, dayHref: (key: string) => `/appointments?view=day&date=${key}` }));
    expect(markup.match(/<a /g)).toHaveLength(7);
    expect(markup).toContain("min-h-[4.5rem]");
    expect(markup).toContain('aria-current="page"');
    expect(text(markup)).toContain("Today Oct 4 2 visits");
    expect(text(markup)).toContain("Tue Sep 29 No visits");
    expect(markup).not.toMatch(RAW_COLOUR);
  });
});

describe("Visits: the Day view", () => {
  const agenda = dayAgenda({ day: new Date(2026, 9, 4), appointments: visits, now: NOW, zone: ZONE });

  it("lists the shop's hours from now on, keeps every visit, and knows which is next", () => {
    expect(agenda.isToday).toBe(true);
    // 11 AM (a visit already over) is kept; the empty hours before 12 PM are not; 8 PM (outside the grid) is kept.
    expect(agenda.rows.map((row) => row.hour)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(agenda.rows.find((row) => row.hour === 12)?.isNow).toBe(true);
    expect(agenda.rows.find((row) => row.hour === 15)?.items.map((item) => item.id)).toEqual(["next"]);
    expect(agenda.nextId).toBe("next");
    expect(agenda.visits).toBe(2);
    expect(agenda.rows[1].slot).toBe("2026-10-04T12:00");
  });

  it("shows only the visits on a day that is over", () => {
    const past = dayAgenda({ day: new Date(2026, 8, 28), appointments: visits, now: NOW, zone: ZONE });
    expect(past.rows.map((row) => row.hour)).toEqual([10]);
    expect(past.isPast).toBe(true);
  });

  it("draws an hour per row: free hours book, visits are cards with initials, Now and Next in words", () => {
    const markup = html(
      React.createElement(DayAgenda, {
        agenda,
        now: NOW,
        zone: ZONE,
        slotHref: (slot: string) => `/appointments?at=${slot}`,
        editHref: (id: string) => `/appointments?edit=${id}`,
        canDelete: true,
        dayLabel: "Sunday, October 4",
      }),
    );
    const readable = text(markup);
    expect(readable).toContain("Now");
    expect(readable).toContain("12:17 PM");
    expect(markup).toContain('href="/appointments?at=2026-10-04T13:00"');
    expect(readable).toContain("Book a visit at 1 PM");
    expect(readable).toContain("Elena Marquez");
    expect(readable).toContain("Next");
    expect(readable).toContain("3 PM – 4 PM");
    expect(markup).toContain(">EM<");
    expect(readable).toContain("Canceled");
    expect(markup).not.toMatch(RAW_COLOUR);
  });

  it("says Happening now / Next only for a booking still to happen", () => {
    expect(visitMoment(visits[2], NOW, "next")).toBe("Next");
    expect(visitMoment({ ...visits[1], endsAt: new Date("2026-10-04T19:00:00Z") }, NOW, "next")).toBe("Happening now");
    expect(visitMoment(visits[0], NOW, "mon")).toBeNull();
  });
});

describe("Visits: the Week view opens on today", () => {
  it("folds the days already gone under 'Earlier this week'", () => {
    const groups = weekGroups({ days: week, appointments: visits, now: NOW, zone: ZONE });
    expect(groups.upcoming.map((group) => group.key)).toEqual(["2026-10-04"]);
    expect(groups.earlier.map((group) => group.key)).toEqual(["2026-09-28"]);

    const markup = html(
      React.createElement(AppointmentCards, {
        days: week,
        appointments: visits,
        editHref: (id: string) => `/appointments?edit=${id}`,
        newHref: "/appointments?new=1",
        canDelete: false,
        now: NOW,
        zone: ZONE,
        foldPast: true,
        dayHref: (key: string) => `/appointments?view=day&date=${key}`,
      }),
    );
    expect(markup.indexOf("Today")).toBeLessThan(markup.indexOf("Earlier this week"));
    expect(markup).toContain("<details");
    expect(markup).toContain('href="/appointments?view=day&amp;date=2026-10-04"');
    // The card's time is the shop's: 3:00 PM, not the runner's own zone.
    expect(text(markup)).toContain("3:00 PM");
  });

  it("says who in words on the staff row, with initials", () => {
    const markup = html(
      React.createElement(StaffChips, {
        chips: [
          { key: "all", label: "Everyone", href: "/appointments", active: true },
          { key: "unassigned", label: "Not assigned", href: "/appointments?tech=unassigned", active: false },
          { key: "usr_1", label: "Marcus Webb", href: "/appointments?tech=usr_1", active: false },
        ],
      }),
    );
    expect(text(markup)).toContain("Staff");
    expect(text(markup)).toContain("Everyone");
    expect(markup).toContain(">MW<");
    expect(markup).toContain("min-h-12");
    expect(markup).not.toContain("Tech");
  });
});

describe("Book a visit from a customer's page", () => {
  const pickers: AppointmentPickers = {
    customers: [{ value: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145" }],
    ticketsByCustomer: {},
    techs: [],
    locations: [],
    timeZone: ZONE,
  };
  const withCustomer: AppointmentFormValues = {
    id: null,
    title: "",
    customerId: "cus_1",
    ticketId: "none",
    assignedToId: "none",
    locationId: "none",
    startDate: "2026-10-04",
    startTime: "13:00",
    duration: "60",
    endTime: "14:00",
    notes: "",
  };

  it("opens on When, with the customer already chosen and ticked", () => {
    expect(initialStep({ id: null, customerId: "cus_1" })).toBe(1);
    expect(initialStep({ id: null, customerId: "" })).toBe(0);
    expect(initialStep({ id: null })).toBe(0);
    const markup = html(
      React.createElement(BookingFlow, { values: withCustomer, pickers, onSaved: () => {}, onCancel: () => {}, now: new Date(2026, 9, 4, 12, 17) } as never),
    );
    expect(text(markup)).toContain("When?");
    expect(text(markup)).toContain("Daniel Brooks");
  });

  it("shows a customer saved with only a number as the number, not 'Customer 5125550142'", () => {
    expect(pickerLines({ value: "c", label: "Customer 5125550199", phone: "(512) 555-0199" })).toEqual({ title: "(512) 555-0199", detail: "No name saved yet" });
    expect(pickerLines({ value: "c", label: "Customer 5125550199" })).toEqual({ title: "5125550199", detail: "No name saved yet" });
    expect(pickerLines({ value: "c", label: "Daniel Brooks", phone: "(512) 555-0145" })).toEqual({ title: "Daniel Brooks", detail: "(512) 555-0145" });
  });

  it("merges people the server found without repeating anyone", () => {
    const merged = withFoundCustomers(pickers, {
      customers: [
        { value: "cus_1", label: "Daniel Brooks" },
        { value: "cus_900", label: "Zed Zane" },
      ],
      ticketsByCustomer: { cus_900: [{ value: "tik_9", label: "#9 · Phone" }] },
    });
    expect(merged.customers.map((customer) => customer.value)).toEqual(["cus_1", "cus_900"]);
    expect(merged.ticketsByCustomer.cus_900).toHaveLength(1);
  });
});

describe("Shop overview leftovers", () => {
  const nothing = { totalCents: 0, count: 0, overdueCount: 0, truncated: false, customers: [], lateInvoices: [] };

  it("shows a calm 'Nothing owed', not a big black Collect payments, when nothing is owed", () => {
    const markup = html(React.createElement(OwedCard, { owed: nothing }));
    expect(text(markup)).toContain("Nothing owed.");
    expect(markup).not.toContain("Collect payments");
    expect(markup).toContain('href="/invoices"');
  });

  it("gives Needs you now an id other screens can link to", () => {
    const markup = html(React.createElement(NeedsYouSection, { rows: [], candidates: 0 }));
    expect(markup).toContain('id="needs-you"');
  });

  it("names the visits card differently from its 'Coming up' column, and books from the empty state", () => {
    const markup = html(React.createElement(AppointmentsCard, { appointments: [] }));
    expect(text(markup)).toContain("Next visits");
    expect(text(markup)).not.toContain("Coming up");
    expect(markup).toContain('href="/appointments?book=1"');
  });
});

describe("Shop floor board", () => {
  const ticket = {
    id: "t1",
    number: 1013,
    subject: "iPhone 14 Pro — touch dropping out again (warranty)",
    status: "Waiting on Customer",
    updatedAt: new Date("2026-09-30T18:00:00Z"),
    dueDate: new Date("2026-10-01T18:00:00Z"),
    customer: { lastName: "Marquez" },
    assignedTo: { name: "Marcus Webb" },
  };

  it("says the whole status, Overdue and the age in words, never cut short", () => {
    const markup = html(React.createElement(TicketTile, { ticket, now: NOW.getTime() }));
    const readable = text(markup);
    expect(readable).toContain("Waiting on Customer");
    expect(readable).toContain("Overdue");
    expect(readable).toContain("Updated 4 days ago");
    expect(readable).toContain("Marquez");
    expect(markup).not.toMatch(/truncate[^"]*">Waiting/);
    expect(markup).not.toMatch(RAW_COLOUR);
  });

  it("can leave the customer's name and notes off for a screen customers see", () => {
    const readable = text(html(React.createElement(TicketTile, { ticket, now: NOW.getTime(), hideNames: true })));
    expect(readable).not.toContain("Marquez");
    expect(readable).not.toContain("touch dropping out");
    expect(readable).toContain("1013");
  });

  it("counts with words and theme tokens only", () => {
    const markup = html(React.createElement(StatusChip, { label: "Ready for Pickup", count: 2, tone: "ready" }));
    expect(text(markup)).toContain("Ready for Pickup");
    expect(text(markup)).toContain("2");
    expect(markup).not.toMatch(RAW_COLOUR);
    expect(markup).not.toContain("style=");
  });
});

describe("Marketing: the step flow", () => {
  const action = vi.fn(async () => ({ ok: false as const, error: "" }));

  it("starts with the ready-written messages as tiles, in plain words", () => {
    const readable = text(html(React.createElement(CampaignFlow, { action: action as never, shopName: "Demo Repair Shop", cancelHref: "/marketing" })));
    expect(readable).toContain("What would you like to send?");
    expect(readable).toContain("2-Week Follow-Up");
    expect(readable).toContain("After a repair is finished, 2 weeks later");
    expect(readable).toContain("Write my own");
    expect(readable).not.toContain("Trigger");
    expect(readable).not.toContain("{{");
  });

  it("editing opens on the message, with [words] for the blanks and one Save", () => {
    const markup = html(
      React.createElement(CampaignFlow, {
        action: action as never,
        shopName: "Demo Repair Shop",
        cancelHref: "/marketing/cmp_1",
        editing: true,
        initial: { id: "cmp_1", name: "Thank You", trigger: "INVOICE_PAID", delayDays: 2, channel: "EMAIL", subject: "Thanks", body: "Hi {{firstName}}, invoice #{{invoiceNumber}}.", active: true },
      }),
    );
    const readable = text(markup);
    expect(readable).toContain("What does it say?");
    expect(markup).toContain("Hi [First name], invoice #[Invoice number].");
    // What is posted keeps the tokens the engine reads.
    expect(markup).toContain('name="body" value="Hi {{firstName}}, invoice #{{invoiceNumber}}."');
    expect(readable).toContain("Save changes");
    expect(readable).toContain("Hi Alex, invoice #1043.");
    expect(readable).toContain("After an invoice is paid");
  });

  it("shows a text message as a phone bubble", () => {
    const readable = text(html(React.createElement(MessagePreview, { sms: true, subject: "", body: "Hi Alex" })));
    expect(readable).toContain("What Alex gets (a text)");
    expect(readable).toContain("Hi Alex");
  });
});

describe("Enquiries", () => {
  it("New enquiry: name and number first, how they got in touch as tiles, one Save enquiry", () => {
    const markup = html(React.createElement(LeadForm, { easy: true }));
    const readable = text(markup);
    expect(readable).toContain("Their name");
    expect(readable).toContain("Phone number");
    expect(readable).toContain("How did they get in touch?");
    for (const tile of ["Phone call", "Walked in", "Website", "A friend sent them", "Other"]) expect(readable).toContain(tile);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain('name="source" value="Phone"');
    expect(readable).toContain("Save enquiry");
    expect(readable).toContain("Add an email");
    expect(readable).not.toContain("lead");
  });

  it("an open enquiry has one big next step, Start a repair, and the rest behind More", () => {
    const markup = html(
      React.createElement(LeadActions, {
        easy: true,
        lead: { id: "lead_1", status: "NEW", values: { name: "Dana", email: "", phone: "", source: "Phone", message: "" } },
        matches: [],
        problemTypes: ["Screen"],
        defaultSubject: "Cracked screen",
        canDelete: true,
      }),
    );
    const readable = text(markup);
    expect(readable).toContain("Start a repair");
    expect(readable).toContain("Mark as called");
    expect(readable).toContain("More");
    // Delete is not a red button beside the black one.
    expect(readable).not.toContain("Delete");
    expect(readable).not.toContain("Convert");
    expect(markup).toContain("h-14");
  });
});

describe("Time clock", () => {
  it("warns about a forgotten clock-out in words", () => {
    const markup = html(
      React.createElement(ClockPanel, {
        openSinceISO: "2026-09-30T15:02:00.000Z",
        openSinceLabel: "9:02 AM",
        todaySeconds: 0,
        weekSeconds: 0,
        forgotSince: "Wed Sep 30, 9:02 AM",
        ownerFixes: true,
      }),
    );
    expect(text(markup)).toContain("Still clocked in since Wed Sep 30, 9:02 AM. Forgot to clock out?");
    expect(text(markup)).toContain("Fix this shift");
  });
});
