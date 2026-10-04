/**
 * "From repair" on a new invoice: the repair's unbilled charges become lines,
 * and saving the invoice marks exactly those charges as billed.
 *
 * Pure and client-safe (no `db`): the bill builder (./bill/flow.ts) builds the
 * lines with `chargeLine`, the form posts the charge ids under
 * `ticketChargeIds`, and createInvoiceAction reads them back with
 * `parseChargeIds` and stamps them inside the transaction that writes the
 * invoice (see app/(app)/invoices/actions.ts).
 *
 * THE SAME LINE AS "MAKE INVOICE". A charge becomes exactly the line the
 * repair's own Make invoice button writes (app/(app)/tickets/actions.ts
 * makeInvoiceAction): its product, description, quantity, unit price and tax
 * flag, nothing else. So a bill made either way totals the same to the cent,
 * and tests/fix-money-from-repair.test.ts holds the two side by side.
 */

/** One charge recorded on a repair that is not on any invoice yet. */
export type RepairCharge = {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

/** The invoice line a charge becomes: the Make invoice mapping, field for field. */
export function chargeLine(charge: RepairCharge): {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
} {
  return {
    productId: charge.productId,
    description: charge.description,
    quantity: charge.quantity,
    unitPriceCents: charge.unitPriceCents,
    taxable: charge.taxable,
  };
}

/** The most charge ids one invoice will carry: far beyond a real repair, small enough to refuse junk. */
export const MAX_CHARGE_IDS = 200;

/**
 * The posted `ticketChargeIds` (a JSON array of ids) as a de-duplicated list.
 * Absent or empty is an empty list. Anything malformed is an error rather than
 * a guess: a list we cannot read must never bill some charges and not others.
 */
export function parseChargeIds(
  raw: FormDataEntryValue | null | undefined,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: true, ids: [] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "The repair's charges could not be read. Pick the repair again." };
  }
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) {
    return { ok: false, error: "The repair's charges could not be read. Pick the repair again." };
  }
  const ids = [...new Set(value as string[])];
  if (ids.length > MAX_CHARGE_IDS) {
    return { ok: false, error: "That is more charges than one invoice can carry." };
  }
  return { ok: true, ids };
}

/** The error a save gets when a charge was billed somewhere else in the meantime. */
export const CHARGES_ALREADY_BILLED =
  "Some of this repair's charges were put on another invoice while you were working. Nothing was saved: pick the repair again to see what is left to bill.";
