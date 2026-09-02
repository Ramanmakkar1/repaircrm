/**
 * Shared shapes for the billing (estimate + invoice) module.
 *
 * The line editor is deliberately dumb about *which* document it is editing —
 * estimates and invoices carry the same line shape apart from `serial`, which
 * only invoices persist. The editor hides the serial column when
 * `showSerial={false}` and simply never emits the field.
 */

import { z } from "zod";

/** A product the line editor can pull description/price/taxable from. */
export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  taxable: boolean;
};

/**
 * A customer the document form can be addressed to.
 *
 * The tax fields are the rate this customer resolves to today (see lib/tax.ts),
 * carried along so picking them in the form can pre-select the document's tax
 * without a round-trip. The server re-resolves it on save regardless.
 */
export type CustomerOption = {
  id: string;
  label: string;
  taxRateId: string | null;
  taxRateBps: number;
  taxExempt: boolean;
};

/**
 * One row as it travels from the client editor to the server action.
 * Quantities/prices are already normalised to integers here — the editor keeps
 * free-text drafts in its own state and only serialises parsed values.
 */
export type SubmittedLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serial: string | null;
};

/** Server-side validation for the JSON blob the editor posts as `lines`. */
export const submittedLineSchema = z.object({
  productId: z.string().min(1).nullable().catch(null),
  description: z.string().trim().min(1, "Every line needs a description").max(500),
  quantity: z.coerce.number().int().min(1).max(100_000),
  unitPriceCents: z.coerce.number().int().min(-100_000_000).max(100_000_000),
  taxable: z.boolean(),
  serial: z.string().trim().max(120).nullable().catch(null),
});

export const submittedLinesSchema = z
  .array(submittedLineSchema)
  .min(1, "Add at least one line item");

/**
 * Parses the hidden `lines` field. Returns a friendly message rather than a
 * zod tree — these errors are rendered straight into the form.
 */
export function parseLines(
  raw: FormDataEntryValue | null
): { ok: true; lines: SubmittedLine[] } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(String(raw ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the line items." };
  }
  const parsed = submittedLinesSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid line items.",
    };
  }
  return { ok: true, lines: parsed.data };
}

/**
 * Shape returned by every billing form action driven with `useActionState`.
 *
 * `done` is a monotonically-increasing stamp bumped on each *successful* run.
 * Dialogs watch it to close themselves, because a successful action that only
 * revalidates (rather than redirecting) is otherwise indistinguishable from the
 * idle state.
 */
export type FormState = {
  error: string | null;
  done?: number;
  /**
   * Set by `takePaymentAction` when the payment it just recorded cleared the
   * balance. The take-payment dialog reads it to offer "Email receipt" as a
   * toast action — the one moment the customer is certain to want one, and the
   * one moment staff are certain to be looking at the screen.
   */
  settled?: boolean;
};

export const IDLE_FORM_STATE: FormState = { error: null };

export function formError(message: string): FormState {
  return { error: message };
}

export function formSuccess(): FormState {
  return { error: null, done: Date.now() };
}
