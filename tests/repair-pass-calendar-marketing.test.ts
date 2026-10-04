import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A stand-in for next/link that prints the `scroll` prop, which a real Link
// consumes and never writes to the markup.
vi.mock("next/link", () => ({
  default: ({
    href,
    scroll,
    children,
    ...rest
  }: {
    href: string;
    scroll?: boolean;
    children?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/app/(app)/appointments/actions", () => ({
  deleteAppointmentAction: vi.fn(),
  setAppointmentStatusAction: vi.fn(),
}));
vi.mock("@/app/(app)/marketing/actions", () => ({
  setCampaignActiveAction: vi.fn(),
  syncAndSendAction: vi.fn(),
  syncCampaignAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { AppointmentCards } = await import("@/components/appointments/appointment-cards");
const { CampaignCards } = await import("@/components/marketing/campaign-cards");
const { CampaignActiveStrip } = await import("@/components/marketing/campaign-controls");

import type { CalendarAppointment } from "@/components/appointments/calendar-meta";
import type { CampaignCardRow } from "@/components/marketing/campaign-cards";

const NOW = new Date(2026, 9, 3, 12, 0, 0);

function appointment(id: string, hour: number): CalendarAppointment {
  return {
    id,
    title: "Drop-off",
    notes: null,
    startsAt: new Date(2026, 9, 3, hour, 0),
    endsAt: new Date(2026, 9, 3, hour + 1, 0),
    status: "SCHEDULED",
    customer: { id: "cus_1", firstName: "Daniel", lastName: "Brooks", businessName: null },
    ticket: null,
    assignedTo: null,
    location: null,
  };
}

describe("appointment cards keep the scroll position", () => {
  const html = renderToStaticMarkup(
    React.createElement(AppointmentCards, {
      days: [new Date(2026, 9, 3)],
      appointments: [appointment("a1", 9), appointment("a2", 11)],
      editHref: (id: string) => `/appointments?edit=${id}`,
      newHref: "/appointments?new=1",
      canDelete: true,
      now: NOW,
    }),
  );

  it("opens the edit dialog with scroll={false}, so a long list does not jump to the top", () => {
    for (const id of ["a1", "a2"]) {
      const link = html.match(new RegExp(`<a\\b[^>]*href="/appointments\\?edit=${id}"[^>]*>`));
      expect(link?.[0]).toContain('data-scroll="false"');
    }
  });

  it("every link on the list that stays on this page keeps its place", () => {
    const links = [...html.matchAll(/<a\b[^>]*href="\/appointments\?[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).toContain('data-scroll="false"');
  });

  it("still looks like the shared card (same radius, border and 7rem height)", () => {
    expect(html).toContain("min-h-28");
    expect(html).toContain("rounded-2xl border border-border bg-surface");
  });
});

describe("the campaign on/off strip is one big tap target", () => {
  const live: CampaignCardRow = {
    id: "cmp_1",
    name: "Two-week check-in",
    trigger: "TICKET_RESOLVED",
    delayDays: 14,
    channel: "EMAIL",
    active: true,
  };
  const paused: CampaignCardRow = { ...live, id: "cmp_2", name: "Welcome", active: false };

  it("is a label around the switch, at least 56px tall, so pressing the words presses the switch", () => {
    const html = renderToStaticMarkup(
      React.createElement(CampaignActiveStrip, { campaignId: "cmp_1", active: true, campaignName: "Two-week check-in" }),
    );
    expect(html.startsWith("<label")).toBe(true);
    expect(html).toContain("min-h-14");
    const inside = html.match(/^<label[^>]*>([\s\S]*)<\/label>$/);
    expect(inside?.[1]).toContain("Sending on its own");
    expect(inside?.[1]).toContain('role="switch"');
    expect(inside?.[1]).toContain('aria-checked="true"');
  });

  it("says Not sending in words when the campaign is paused", () => {
    const html = renderToStaticMarkup(
      React.createElement(CampaignActiveStrip, { campaignId: "cmp_2", active: false, campaignName: "Welcome" }),
    );
    expect(html).toContain("Not sending");
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Switch on Welcome");
  });

  it("sits under each card, beside the card link and never inside it", () => {
    const html = renderToStaticMarkup(
      React.createElement(CampaignCards, { rows: [live, paused], stats: new Map() }),
    );
    expect(html.match(/<label/g)?.length).toBe(2);
    for (const id of ["cmp_1", "cmp_2"]) {
      const link = html.match(new RegExp(`<a\\b[^>]*marketing/${id}[^>]*>([\\s\\S]*?)</a>`));
      expect(link?.[1]).not.toContain("<label");
      expect(link?.[1]).not.toContain("<button");
    }
  });
});
