import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The cards only need these to exist: nothing here presses a switch.
vi.mock("@/app/(app)/marketing/actions", () => ({
  setCampaignActiveAction: vi.fn(),
  syncAndSendAction: vi.fn(),
  syncCampaignAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { CampaignCards } = await import("@/components/marketing/campaign-cards");
const { SyncAndSendButton } = await import("@/components/marketing/campaign-controls");
const { campaignCardParts } = await import("@/components/marketing/card-meta");

import type { CampaignCardRow } from "@/components/marketing/campaign-cards";

const live: CampaignCardRow = {
  id: "cmp_1",
  name: "Two-week check-in",
  trigger: "TICKET_RESOLVED",
  delayDays: 14,
  channel: "EMAIL",
  active: true,
};
const paused: CampaignCardRow = {
  id: "cmp_2",
  name: "Welcome to the shop",
  trigger: "CUSTOMER_CREATED",
  delayDays: 1,
  channel: "SMS",
  active: false,
};

const stats = new Map([["cmp_1", { scheduled: 3, sent: 1 }]]);

function render(rows: CampaignCardRow[]): string {
  return renderToStaticMarkup(React.createElement(CampaignCards, { rows, stats }));
}

describe("campaignCardParts", () => {
  it("says when it goes out, how, and how many", () => {
    const parts = campaignCardParts(live, { scheduled: 3, sent: 1 });
    expect(parts.subtitle).toBe("After a repair is finished · 2 weeks later");
    expect(parts.facts).toEqual([
      { key: "channel", text: "Email" },
      { key: "sent", text: "1 sent" },
      { key: "queued", text: "3 waiting" },
    ]);
    expect(parts.statusLabel).toBe("Live");
  });

  it("calls an SMS campaign a text and a switched-off one Paused", () => {
    const parts = campaignCardParts(paused, { scheduled: 0, sent: 0 });
    expect(parts.facts[0].text).toBe("Text");
    expect(parts.statusLabel).toBe("Paused");
  });
});

describe("CampaignCards", () => {
  it("shows each campaign as a card linking to it, with its state in words", () => {
    const html = render([live, paused]);
    expect(html).toContain('href="/marketing/cmp_1"');
    expect(html).toContain('href="/marketing/cmp_2"');
    expect(html).toContain("Two-week check-in");
    expect(html).toContain("Live");
    expect(html).toContain("Paused");
    expect(html).toContain("1 sent");
    expect(html).toContain("3 waiting");
    expect(html).toContain("0 sent");
  });

  it("keeps the on/off switch beside the card link, never inside it", () => {
    const html = render([live]);
    expect(html).toContain('role="switch"');
    expect(html).toContain("Pause Two-week check-in");
    const link = html.match(/<a\b[^>]*marketing\/cmp_1[^>]*>([\s\S]*?)<\/a>/);
    expect(link?.[1]).not.toContain("<button");
  });

  it("offers a way back to every campaign when a view is empty", () => {
    const html = render([]);
    expect(html).toContain("Nothing in this view");
    expect(html).toContain('href="/marketing"');
    expect(html).toContain("Show all campaigns");
  });
});

describe("SyncAndSendButton", () => {
  it("is the black button when messages are due", () => {
    const html = renderToStaticMarkup(React.createElement(SyncAndSendButton, { dueCount: 4 }));
    expect(html).toContain("Send 4 due now");
    expect(html).toContain("bg-accent");
  });

  it("stays an outline button in Easy mode, so New campaign is the one primary action", () => {
    const html = renderToStaticMarkup(React.createElement(SyncAndSendButton, { dueCount: 4, quiet: true }));
    expect(html).toContain("Send 4 due now");
    expect(html).not.toContain("bg-accent");
    expect(html).toContain("border-border-strong");
  });
});
