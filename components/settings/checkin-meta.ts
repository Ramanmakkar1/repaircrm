/**
 * Front-counter settings: the public check-in form and the review request.
 *
 * Both live in the `Shop.settings` JSON blob under their own keys, and both are
 * read by code on either side of the wire — the public check-in page, the
 * settings tab, the review job — so this file stays pure: no `db`, no `next/*`,
 * no "use server". (Same contract as components/tickets/ticket-meta.ts.)
 */

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** The optional intake fields a shop can hide from the public form. */
export const CHECKIN_OPTIONAL_FIELDS = [
  "make",
  "model",
  "serial",
  "unlockCode",
] as const;

export type CheckinFieldKey = (typeof CHECKIN_OPTIONAL_FIELDS)[number];

export const CHECKIN_FIELD_LABEL: Record<CheckinFieldKey, string> = {
  make: "Make",
  model: "Model",
  serial: "Serial / IMEI",
  unlockCode: "Unlock code or passcode",
};

export const CHECKIN_FIELD_HINT: Record<CheckinFieldKey, string> = {
  make: "Apple, Samsung, Dell…",
  model: "iPhone 14 Pro, XPS 13…",
  serial: "Helps match the device to the right ticket.",
  unlockCode: "Needed to test the repair. Stored with the ticket, never shown publicly.",
};

export const DEFAULT_CHECKIN_TERMS = [
  "By signing below you authorise diagnosis of the device described above.",
  "We will contact you with an estimate before any chargeable work begins.",
  "Devices left more than 30 days after completion may be recycled.",
].join("\n\n");

export type CheckinSettings = {
  enabled: boolean;
  terms: string;
  /** Which optional device fields the public form shows. */
  fields: Record<CheckinFieldKey, boolean>;
};

export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = {
  enabled: false,
  terms: DEFAULT_CHECKIN_TERMS,
  fields: { make: true, model: true, serial: true, unlockCode: true },
};

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Placeholders the review template understands. */
export const REVIEW_TOKENS = ["{customer}", "{shop}", "{link}"] as const;

export const DEFAULT_REVIEW_TEMPLATE =
  "Hi {customer}, thanks for choosing {shop}! If we did right by you, a quick review would mean a lot: {link}";

export const DEFAULT_REVIEW_DELAY_HOURS = 24;

export type ReviewSettings = {
  enabled: boolean;
  /** Google review link, or any URL the shop wants people sent to. */
  url: string;
  delayHours: number;
  template: string;
};

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  enabled: false,
  url: "",
  delayHours: DEFAULT_REVIEW_DELAY_HOURS,
  template: DEFAULT_REVIEW_TEMPLATE,
};

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function blob(settings: unknown, key: string): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const value = (settings as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/**
 * Reads `settings.checkin`, tolerating every shape the Json column can legally
 * hold. A shop that has never opened the tab reads back as "disabled with the
 * default terms", which is exactly what the public route needs to 404 on.
 */
export function readCheckinSettings(settings: unknown): CheckinSettings {
  const raw = blob(settings, "checkin");
  const rawFields = blob(raw, "fields");

  const fields = { ...DEFAULT_CHECKIN_SETTINGS.fields };
  for (const key of CHECKIN_OPTIONAL_FIELDS) {
    if (typeof rawFields[key] === "boolean") fields[key] = rawFields[key] as boolean;
  }

  return {
    enabled: raw.enabled === true,
    terms: str(raw.terms, DEFAULT_CHECKIN_TERMS),
    fields,
  };
}

export function readReviewSettings(settings: unknown): ReviewSettings {
  const raw = blob(settings, "reviews");
  const delay = Number(raw.delayHours);

  return {
    enabled: raw.enabled === true,
    url: str(raw.url, ""),
    // 0 is a legitimate delay ("send as soon as the job runs"), so the guard is
    // finite-and-not-negative rather than truthiness.
    delayHours:
      Number.isFinite(delay) && delay >= 0
        ? Math.min(Math.round(delay), 24 * 30)
        : DEFAULT_REVIEW_DELAY_HOURS,
    template: str(raw.template, DEFAULT_REVIEW_TEMPLATE),
  };
}

/** Fills {customer} / {shop} / {link} in a review template. */
export function renderReviewMessage(
  template: string,
  values: { customer: string; shop: string; link: string },
): string {
  return template
    .replaceAll("{customer}", values.customer)
    .replaceAll("{shop}", values.shop)
    .replaceAll("{link}", values.link);
}

/**
 * A URL we are willing to put in a customer's inbox. Only http(s) — a
 * `javascript:` or `data:` "review link" typed into settings would otherwise be
 * mailed out under the shop's name.
 */
export function safeExternalUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
