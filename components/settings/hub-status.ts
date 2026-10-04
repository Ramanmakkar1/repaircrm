import type { StatusTone } from "@/components/ui/badge";

/**
 * The one line of live detail, and the one status word, on each Settings hub
 * tile. Pure, so the words can be tested without rendering anything.
 *
 * A tile only carries a status word when "is it on?" is the question an owner
 * opens that area to answer (payments, emails, check-in...). The rest get a
 * plain fact ("4 people", "2 locations").
 */
export type HubFacts = {
  shopName: string;
  city: string;
  devices: number;
  problems: number;
  locations: number;
  replies: number;
  people: number;
  twoStepOn: boolean;
  payments: { connected: boolean; live: boolean; squareConnected: boolean; readers: number };
  shopLinkOn: boolean;
  emailLive: boolean;
  smsLive: boolean;
  checkinOn: boolean;
  reviewsOn: boolean;
  accounting: { connected: number; error: number; configured: boolean };
  developerKeys: number;
  automationIntervalMin: number;
};

export type HubLine = { detail: string; state?: { label: string; tone: StatusTone } };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function hubLines(facts: HubFacts): Record<string, HubLine> {
  const cardsOn = facts.payments.connected || facts.payments.squareConnected;
  const sending = facts.emailLive || facts.smsLive;
  return {
    shop: { detail: [facts.shopName, facts.city].filter(Boolean).join(" · ") || "Name, address and tax" },
    workflow: { detail: `${plural(facts.devices, "device")} · ${plural(facts.problems, "problem")}` },
    locations: { detail: facts.locations <= 1 ? "One shop" : plural(facts.locations, "location") },
    canned: { detail: facts.replies === 0 ? "None saved yet" : plural(facts.replies, "saved reply", "saved replies") },
    team: { detail: plural(facts.people, "person can sign in", "people can sign in") },
    profile: {
      detail: "Name and password",
      state: { label: facts.twoStepOn ? "Two-step sign-in on" : "Two-step sign-in off", tone: facts.twoStepOn ? "success" : "neutral" },
    },
    payments: {
      detail: cardsOn
        ? facts.payments.readers > 0
          ? `Cards online and ${plural(facts.payments.readers, "card machine")}`
          : "Customers can pay by card"
        : "Cash and cheque work today",
      state: cardsOn
        ? { label: "Card payments on", tone: "success" }
        : { label: facts.payments.live ? "Cards not connected" : "Cards not set up", tone: "neutral" },
    },
    connect: {
      detail: "QR code, sign and connections",
      state: facts.shopLinkOn ? { label: "Link is on", tone: "success" } : { label: "Link is off", tone: "neutral" },
    },
    messaging: {
      detail: facts.emailLive && facts.smsLive ? "Emails and texts reach customers" : facts.emailLive ? "Emails go out, texts do not" : facts.smsLive ? "Texts go out, emails do not" : "Messages are not leaving the shop yet",
      state: sending ? { label: facts.emailLive && facts.smsLive ? "Sending" : "Partly sending", tone: facts.emailLive && facts.smsLive ? "success" : "active" } : { label: "Not sending yet", tone: "neutral" },
    },
    checkin: {
      detail: facts.reviewsOn ? "Review requests on" : "Review requests off",
      state: facts.checkinOn ? { label: "Check-in on", tone: "success" } : { label: "Check-in off", tone: "neutral" },
    },
    integrations: {
      detail: "QuickBooks or Xero",
      state:
        facts.accounting.error > 0
          ? { label: "Needs a look", tone: "danger" }
          : facts.accounting.connected > 0
            ? { label: "Connected", tone: "success" }
            : { label: facts.accounting.configured ? "Not connected" : "Not set up", tone: "neutral" },
    },
    "api-keys": { detail: facts.developerKeys === 0 ? "No program connected" : plural(facts.developerKeys, "program key") },
    automation: {
      detail: facts.automationIntervalMin > 0 ? `Runs every ${facts.automationIntervalMin} minutes` : "Only when you press Run now",
      state: facts.automationIntervalMin > 0 ? { label: "Running", tone: "success" } : { label: "Not running by itself", tone: "active" },
    },
    audit: { detail: "Who changed what, day by day" },
  };
}
