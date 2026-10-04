import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The cards only need these to exist: nothing here presses a button.
vi.mock("@/app/(app)/appointments/actions", () => ({
  deleteAppointmentAction: vi.fn(),
  setAppointmentStatusAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { AppointmentCards } = await import("@/components/appointments/appointment-cards");
const { CalendarNav } = await import("@/components/appointments/calendar-nav");
const { TodayStrip } = await import("@/components/appointments/today-strip");
const { appointmentCardParts, dayHeading } = await import("@/components/appointments/card-meta");
const { startsWithMoreDetails } = await import("@/components/appointments/dialog-meta");

import type { CalendarAppointment } from "@/components/appointments/calendar-meta";

// Saturday 3 October 2026, local time (the same clock the page uses).
const NOW = new Date(2026, 9, 3, 12, 0, 0);

function appointment(over: Partial<CalendarAppointment> = {}): CalendarAppointment {
  return {
    id: "appt_1",
    title: "Drop-off - Latitude 5420",
    notes: null,
    startsAt: new Date(2026, 9, 3, 9, 0),
    endsAt: new Date(2026, 9, 3, 10, 0),
    status: "SCHEDULED",
    customer: { id: "cus_1", firstName: "Daniel", lastName: "Brooks", businessName: null },
    ticket: { id: "tik_1", number: 1015, subject: "Thermal service" },
    assignedTo: { id: "usr_1", name: "Marcus Webb" },
    location: { id: "loc_1", name: "Main" },
    ...over,
  };
}

const editHref = (id: string) => `/appointments?edit=${id}`;

function cards(items: CalendarAppointment[], over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(AppointmentCards, {
      days: [new Date(2026, 9, 3), new Date(2026, 9, 4)],
      appointments: items,
      editHref,
      newHref: "/appointments?new=1",
      canDelete: true,
      now: NOW,
      ...over,
    }),
  );
}

describe("dayHeading", () => {
  it("says Today and Tomorrow in words, and the weekday otherwise", () => {
    expect(dayHeading(new Date(2026, 9, 3), NOW)).toEqual({
      main: "Today",
      sub: "Saturday, October 3",
      today: true,
    });
    expect(dayHeading(new Date(2026, 9, 4), NOW)).toMatchObject({ main: "Tomorrow", today: false });
    expect(dayHeading(new Date(2026, 9, 7), NOW)).toEqual({
      main: "Wednesday",
      sub: "October 7",
      today: false,
    });
  });
});

describe("appointmentCardParts", () => {
  it("leads with the time, names the customer and states the facts", () => {
    const parts = appointmentCardParts(appointment());
    expect(parts.hour).toBe("9:00");
    expect(parts.period).toBe("AM");
    expect(parts.title).toBe("Daniel Brooks");
    expect(parts.subtitle).toBe("Drop-off - Latitude 5420");
    expect(parts.facts.map((fact) => fact.text)).toEqual([
      "9 AM – 10 AM",
      "Marcus Webb",
      "Repair #1015",
    ]);
    expect(parts.canceled).toBe(false);
  });

  it("falls back to the booking's own title and the place when nobody is attached", () => {
    const parts = appointmentCardParts(
      appointment({ customer: null, ticket: null, assignedTo: null, notes: "Bring the charger" }),
    );
    expect(parts.title).toBe("Drop-off - Latitude 5420");
    expect(parts.subtitle).toBe("Bring the charger");
    expect(parts.facts.map((fact) => fact.text)).toEqual(["9 AM – 10 AM", "Unassigned", "Main"]);
  });

  it("never shows more than three facts", () => {
    expect(appointmentCardParts(appointment()).facts.length).toBeLessThanOrEqual(3);
  });

  it("knows a canceled booking", () => {
    expect(appointmentCardParts(appointment({ status: "CANCELED" })).canceled).toBe(true);
  });
});

describe("AppointmentCards", () => {
  it("makes each booking a card that opens the same edit dialog the table did", () => {
    const html = cards([appointment()]);
    expect(html).toContain('href="/appointments?edit=appt_1"');
    expect(html).toContain("Daniel Brooks");
    expect(html).toContain("9:00");
    expect(html).toContain("Scheduled");
    expect(html).toContain("1 booked");
    expect(html).toContain("Today");
  });

  it("keeps Mark done / More as sibling buttons, never inside the card link", () => {
    const html = cards([appointment()]);
    expect(html).toContain("Mark done");
    expect(html).toContain("More");
    const link = html.match(/<a\b[^>]*appointments\?edit=appt_1[^>]*>([\s\S]*?)<\/a>/);
    expect(link?.[1]).not.toContain("<button");
    expect(link?.[1]).not.toContain("<a ");
  });

  it("offers Reopen, in words, for a booking that is done", () => {
    const html = cards([appointment({ status: "DONE" })]);
    expect(html).toContain("Done");
    expect(html).toContain("Reopen");
    expect(html).not.toContain("Mark done");
  });

  it("groups cards under the days that have bookings only", () => {
    const html = cards([
      appointment(),
      appointment({ id: "appt_2", startsAt: new Date(2026, 9, 4, 14, 30), endsAt: new Date(2026, 9, 4, 15, 0) }),
    ]);
    expect(html).toContain("Today");
    expect(html).toContain("Tomorrow");
    expect(html).toContain("2:30");
    expect(html).toContain("PM");
  });

  it("names the next action when nothing is booked", () => {
    const html = cards([]);
    expect(html).toContain("Nothing booked");
    expect(html).toContain('href="/appointments?new=1"');
    expect(html).toContain("Book a visit");
  });

  it("explains a filtered empty list instead of offering to book", () => {
    const html = cards([], { filtered: true });
    expect(html).toContain("Nothing booked for this person");
    expect(html).not.toContain('href="/appointments?new=1"');
  });
});

describe("CalendarNav", () => {
  const props = { title: "Sep 28 – Oct 4, 2026", prevHref: "/p", todayHref: "/t", nextHref: "/n" };

  it("Easy mode: three big buttons with words on them", () => {
    const html = renderToStaticMarkup(React.createElement(CalendarNav, { ...props, simple: true }));
    expect(html).toContain("Previous");
    expect(html).toContain("Today");
    expect(html).toContain("Next");
    expect(html).toContain('href="/p"');
    expect(html).toContain('href="/t"');
    expect(html).toContain('href="/n"');
    expect(html).toContain("h-12");
    expect(html).toContain("Sep 28 – Oct 4, 2026");
  });

  it("Full mode keeps the compact icon pair, labelled for screen readers", () => {
    const html = renderToStaticMarkup(React.createElement(CalendarNav, { ...props, simple: false }));
    expect(html).toContain('aria-label="Previous"');
    expect(html).toContain('aria-label="Next"');
    expect(html).not.toContain("h-12");
  });
});

describe("TodayStrip (Easy mode)", () => {
  it("counts visits and points at what is next", () => {
    const html = renderToStaticMarkup(
      React.createElement(TodayStrip, {
        count: 2,
        next: appointment({ startsAt: new Date(2026, 9, 3, 14, 0), endsAt: new Date(2026, 9, 3, 15, 0) }),
        now: NOW,
        editHref,
        simple: true,
      }),
    );
    expect(html).toContain("2 visits today");
    expect(html).toContain("Next · 2 PM");
    expect(html).toContain("Daniel Brooks");
    expect(html).toContain('href="/appointments?edit=appt_1"');
  });

  it("says so plainly when the day is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(TodayStrip, { count: 0, next: null, now: NOW, editHref, simple: true }),
    );
    expect(html).toContain("Nothing booked today");
  });
});

describe("startsWithMoreDetails (the booking form's extra fields)", () => {
  const blank = {
    id: null,
    ticketId: "none",
    assignedToId: "none",
    locationId: "none",
    duration: "60",
    notes: "",
  };

  it("Full mode always shows everything", () => {
    expect(startsWithMoreDetails(blank, false)).toBe(true);
  });

  it("Easy mode starts a new booking with four inputs, even with a branch pre-selected", () => {
    expect(startsWithMoreDetails(blank, true)).toBe(false);
    expect(startsWithMoreDetails({ ...blank, locationId: "loc_1" }, true)).toBe(false);
  });

  it("Easy mode opens the details when editing a booking that has any", () => {
    const edit = { ...blank, id: "appt_1" };
    expect(startsWithMoreDetails(edit, true)).toBe(false);
    expect(startsWithMoreDetails({ ...edit, assignedToId: "usr_1" }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, ticketId: "tik_1" }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, locationId: "loc_1" }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, duration: "90" }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, duration: "custom" }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, notes: "  Bring the charger " }, true)).toBe(true);
    expect(startsWithMoreDetails({ ...edit, notes: "   " }, true)).toBe(false);
  });
});
