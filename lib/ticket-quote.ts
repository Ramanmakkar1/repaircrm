/**
 * Check-in keeps two facts in `Ticket.customFields` beside the shop's own
 * free-form fields: the price quoted at the counter (`quotedPriceCents`) and
 * when the customer accepted the terms (`termsAcceptedAt`).
 *
 * They are the app's, not the shop's: the Custom fields card must neither show
 * them as raw keys ("quotedPriceCents 18999", visible to a technician) nor drop
 * them when it saves its own rows.
 */
export const INTAKE_FIELD_KEYS = ["quotedPriceCents", "termsAcceptedAt"] as const;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The price quoted at check-in, in cents, or null when none was given. */
export function quotedPriceCents(customFields: unknown): number | null {
  const raw = asObject(customFields).quotedPriceCents;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

/** The shop's own fields, without the check-in keys. */
export function shopCustomFields(customFields: unknown): Record<string, unknown> {
  const out = { ...asObject(customFields) };
  for (const key of INTAKE_FIELD_KEYS) delete out[key];
  return out;
}

/** The check-in keys alone, to carry over when the shop's fields are rewritten. */
export function intakeCustomFields(customFields: unknown): Record<string, unknown> {
  const source = asObject(customFields);
  const out: Record<string, unknown> = {};
  for (const key of INTAKE_FIELD_KEYS) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}
