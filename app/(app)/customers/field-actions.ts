"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActionResult } from "@/app/(app)/customers/actions";

/**
 * One field of one customer, written on its own.
 *
 * The sibling of `setTicketFieldAction`, and for the same reason: the customer
 * edit form posts all eighteen columns at once, so correcting a mistyped phone
 * number republishes the address, the opt-ins and the tax exemption alongside
 * it — and stamps over whatever a colleague changed in the meantime. This
 * writes the one named column.
 *
 * THE ALLOW-LIST IS THE POINT. `field` arrives over the wire and is never
 * spread into a Prisma `data` object; each branch names its column literally,
 * so this endpoint cannot be pushed into setting `shopId`, `id`,
 * `creditBalanceCents` or `stripePaymentMethodId`. Anything not on the list is
 * refused before a query runs.
 *
 * NOT THE ADDRESS. address1/address2/city/state/postalCode/country are a
 * single unit — a street without its city is not a half-correct address, it is
 * a wrong one — so they stay in the form that validates them together.
 *
 * MULTI-TENANCY: `shopId` comes from the session. The write is an `updateMany`
 * filtered on `{ id, shopId }`, so another tenant's customer id matches zero
 * rows and reads back as "not found".
 *
 * Refusals are returned rather than thrown — see the note in
 * app/(app)/tickets/field-actions.ts. No audit row, because neither
 * `updateCustomerAction` nor `saveCustomerNotesAction` writes one and
 * `AuditAction` has no `customer.updated` member; only the deletion is logged.
 */
export async function setCustomerFieldAction(
  customerId: string,
  field: string,
  value: string,
): Promise<ActionResult> {
  // `updateCustomerAction` guards with `requireUser` — editing a customer is
  // front-desk work, not an owner-only act — so this matches it.
  const { shopId } = await requireUser();

  const next = value.trim();

  let data:
    | { phone: string | null }
    | { email: string | null }
    | { referredBy: string | null };

  switch (field) {
    case "phone": {
      // Deliberately not pattern-matched. Shops record extensions, pager
      // numbers and "ask for Dave" — the form has never validated the shape
      // and this must not start, or the header would refuse numbers the edit
      // page accepts. The ceiling is the column's.
      if (next.length > 40) {
        return { ok: false, error: "A phone number can be 40 characters at most." };
      }
      data = { phone: next === "" ? null : next };
      break;
    }

    case "email": {
      // Empty clears it. `undefined` would mean "leave unchanged" to Prisma,
      // which would make deleting a wrong address impossible.
      if (next === "") {
        data = { email: null };
        break;
      }
      // Same rule as the form: validated, stored lowercase.
      const parsed = z.email().max(160).safeParse(next.toLowerCase());
      if (!parsed.success) {
        return { ok: false, error: "Enter a valid email address." };
      }
      data = { email: parsed.data };
      break;
    }

    case "referredBy": {
      if (next.length > 120) {
        return { ok: false, error: "Referred by can be 120 characters at most." };
      }
      data = { referredBy: next === "" ? null : next };
      break;
    }

    default:
      return { ok: false, error: "That field can't be edited from here." };
  }

  const { count } = await db.customer.updateMany({
    where: { id: customerId, shopId },
    data,
  });
  if (count === 0) return { ok: false, error: "Customer not found." };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}
