/**
 * The public shop hub: `Shop.settings.publicHub`.
 *
 * One link a shop puts on their website, their Google listing, their receipts
 * and the sticker in the window — `/s/<slug>` — and this is the block that says
 * what is on it.
 *
 * Read on both sides of the wire (the public page, the Connect screen, the save
 * action), so this file stays pure: no `db`, no `next/*`, no "use server".
 * Same contract as ./checkin-meta.ts.
 */

/** The cards the owner can switch on and off, in the order they appear. */
export const HUB_CARDS = ["status", "booking", "quote", "pay"] as const;

export type HubCardKey = (typeof HUB_CARDS)[number];

export const HUB_CARD_LABEL: Record<HubCardKey, string> = {
  status: "Check my repair status",
  booking: "Book an appointment",
  quote: "Get a quote or ask a question",
  pay: "Pay a bill",
};

export const HUB_CARD_HINT: Record<HubCardKey, string> = {
  status: "We email a sign-in link to whoever matches the ticket. Nothing is shown on the page itself.",
  booking: "Lands in your leads inbox with the day and time they asked for.",
  quote: "Lands in your leads inbox as a question to answer.",
  pay: "We email a link straight to the invoice, with a Pay button on it.",
};

export type PublicHubSettings = {
  /** Master switch. While this is off, `/s/<slug>` is a 404. */
  enabled: boolean;
  /**
   * Opt in to being found in search. Default off: a half-configured shop link
   * that gets crawled is a support call, and the shop can flip it the day the
   * page says what they want it to say.
   */
  indexable: boolean;
  /** Which cards the page offers. Check-in has its own switch (checkin.enabled). */
  cards: Record<HubCardKey, boolean>;
  /** Opening hours, free text, one line per day. Shown only when set. */
  hours: string;
};

export const DEFAULT_PUBLIC_HUB_SETTINGS: PublicHubSettings = {
  enabled: false,
  indexable: false,
  // Every card on by default, so switching the page on once is the whole job.
  cards: { status: true, booking: true, quote: true, pay: true },
  hours: "",
};

function blob(settings: unknown, key: string): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const value = (settings as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Reads `settings.publicHub`, tolerating every shape the Json column can hold.
 * A shop that has never opened the Connect screen reads back as "off", which is
 * exactly what `/s/<slug>` needs in order to 404.
 */
export function readPublicHub(settings: unknown): PublicHubSettings {
  const raw = blob(settings, "publicHub");
  const rawCards = blob(raw, "cards");

  const cards = { ...DEFAULT_PUBLIC_HUB_SETTINGS.cards };
  for (const key of HUB_CARDS) {
    if (typeof rawCards[key] === "boolean") cards[key] = rawCards[key] as boolean;
  }

  return {
    enabled: raw.enabled === true,
    indexable: raw.indexable === true,
    cards,
    hours: typeof raw.hours === "string" ? raw.hours.slice(0, 600) : "",
  };
}

/**
 * The shop's postal address as one line, for the hub header and the map link.
 * Returns "" when the shop has not filled an address in — the hub then simply
 * leaves the line (and the map link) out rather than printing empty commas.
 */
export function addressLine(shop: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string {
  const street = [shop.address1, shop.address2].filter(Boolean).join(", ");
  const region = [shop.city, shop.state].filter(Boolean).join(", ");
  return [street, region, shop.postalCode].filter(Boolean).join(" · ").trim();
}

/**
 * A maps link for an address line. Deliberately the generic Google Maps search
 * URL rather than a keyed Places API call: it opens the customer's own default
 * map app on a phone, needs no key, and cannot break when a key expires.
 */
export function mapLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
