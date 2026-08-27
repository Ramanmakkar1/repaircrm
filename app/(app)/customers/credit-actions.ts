"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, parseCents } from "@/lib/money";

/**
 * Store-credit adjustments.
 *
 * `Customer.creditBalanceCents` is real money the shop is holding — a deposit,
 * a refund the customer chose to leave on account, a goodwill gesture. It is
 * spent through the CREDIT payment method on an invoice (see
 * app/(app)/invoices/actions.ts takePaymentAction), which decrements it inside
 * the same transaction that writes the payment.
 *
 * FUTURE WORK: there is no ledger model, so an adjustment records the new
 * balance and nothing else — the `reason` collected by the dialog is shown back
 * to the operator for confirmation and then discarded. A `CreditAdjustment`
 * table (delta, reason, userId, createdAt) is the missing piece; the schema is
 * frozen for this phase, so it is called out rather than faked into
 * CommunicationLog (that outbox means "we messaged the customer") or Payment
 * (which would invent a payment against an invoice that does not exist).
 */

export type CreditResult =
  | { ok: true; balanceCents: number; message: string }
  | { ok: false; error: string };

/** A sane ceiling on a single adjustment — $100,000. Typos are expensive. */
const MAX_ADJUSTMENT_CENTS = 10_000_000;

export async function adjustCustomerCreditAction(input: {
  customerId: string;
  direction: "add" | "remove";
  /** Free text from the money input, e.g. "25" or "$25.00". */
  amount: string;
  reason: string;
}): Promise<CreditResult> {
  // Front desk hands out and redeems credit all day; techs have no business
  // moving money. OWNER included so the shop owner is never locked out.
  const { shopId, role } = await requireUser();
  if (role !== "OWNER" && role !== "FRONT_DESK") {
    return { ok: false, error: "Only an owner or front desk can adjust store credit." };
  }

  const amountCents = parseCents(input.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (amountCents > MAX_ADJUSTMENT_CENTS) {
    return {
      ok: false,
      error: `Adjustments are capped at ${formatCents(MAX_ADJUSTMENT_CENTS)}.`,
    };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Say what this adjustment is for." };
  }

  try {
    // Read-then-write in one transaction: two front-desk staff drawing credit
    // down at the same moment must not both see the old balance.
    const balanceCents = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, shopId },
        select: { id: true, creditBalanceCents: true },
      });
      if (!customer) throw new Error("That customer no longer exists.");

      if (input.direction === "remove" && customer.creditBalanceCents < amountCents) {
        throw new Error(
          `Only ${formatCents(customer.creditBalanceCents)} of credit is on file.`,
        );
      }

      // Clamped at zero: a negative store-credit balance is a debt, and debts
      // belong on an invoice where they can be chased, not in this field.
      const next = Math.max(
        0,
        input.direction === "add"
          ? customer.creditBalanceCents + amountCents
          : customer.creditBalanceCents - amountCents,
      );

      await tx.customer.update({
        where: { id: customer.id },
        data: { creditBalanceCents: next },
      });

      return next;
    });

    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath(`/customers/${input.customerId}/statement`);

    return {
      ok: true,
      balanceCents,
      message: `${input.direction === "add" ? "Added" : "Removed"} ${formatCents(
        amountCents,
      )} — balance is now ${formatCents(balanceCents)}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not adjust that balance.",
    };
  }
}
