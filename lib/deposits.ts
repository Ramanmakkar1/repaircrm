import type { Prisma } from "@prisma/client";

/**
 * Deposits taken at intake.
 *
 * ---------------------------------------------------------------------------
 * A DEPOSIT IS STORE CREDIT WITH A PAPER TRAIL
 * ---------------------------------------------------------------------------
 * When the front desk takes $50 up front for a screen order, three rows land in
 * one transaction: a `Deposit` (the receipt the customer walks out with), a
 * `CreditAdjustment` (+$50, "Deposit on ticket #1042") and the bumped
 * `Customer.creditBalanceCents`. `Ticket.depositCents` is the cached per-ticket
 * total, the same split as Product.stockQty vs StockAdjustment.
 *
 * Money is therefore only ever held in ONE place — the customer's credit
 * balance. The Deposit row records where it came from and, once the repair is
 * billed, which invoice consumed it.
 *
 * ---------------------------------------------------------------------------
 * APPLYING
 * ---------------------------------------------------------------------------
 * The moment an invoice is raised from the ticket the deposit is spent against
 * it: a CREDIT `Payment`, a negative `CreditAdjustment`, a decremented balance
 * and `Deposit.appliedInvoiceId`. All inside the caller's transaction, so a
 * deposit can never be consumed by an invoice that failed to save.
 *
 * A plain server module, NOT a `"use server"` file: every entry point has
 * already resolved `shopId` from the session.
 */

type Tx = Prisma.TransactionClient;

/** Reason text for the ledger row a spend writes. Shared so the two callers match. */
export function appliedReason(invoiceNumber: number): string {
  return `Applied to invoice #${invoiceNumber}`;
}

/**
 * Records store credit being SPENT.
 *
 * Both checkout paths (invoice payment and POS) already decrement the balance;
 * what they historically did not do is write the matching ledger row, which
 * left the customer's credit history reading as a list of top-ups with money
 * silently vanishing between them. This is the missing half — always called in
 * the same transaction as the decrement.
 */
export async function recordCreditSpend(
  tx: Tx,
  input: {
    shopId: string;
    customerId: string;
    amountCents: number;
    invoiceNumber: number;
    userId: string | null;
  },
): Promise<void> {
  if (input.amountCents <= 0) return;
  await tx.creditAdjustment.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId,
      deltaCents: -input.amountCents,
      reason: appliedReason(input.invoiceNumber),
      userId: input.userId,
    },
  });
}

export type DepositPlan = {
  /** What the deposits can cover on this invoice, in cents. Zero for none. */
  amountCents: number;
  depositIds: string[];
};

export const NO_DEPOSITS: DepositPlan = { amountCents: 0, depositIds: [] };

/**
 * Works out what a ticket's unapplied deposits can pay off, WITHOUT writing
 * anything. Split from the commit so the POS can size its tender before the
 * invoice exists — a customer who left $50 up front owes $100 on a $150 repair,
 * and the drawer needs to know that before it opens.
 *
 * The amount is the smallest of three ceilings, every one of them real:
 *   · the deposits still sitting unapplied on this ticket,
 *   · the invoice total (a $50 deposit against a $30 repair leaves $20 on
 *     account — it does not overpay the invoice),
 *   · the customer's credit balance right now (the deposit money lives there,
 *     and it may have been spent on something else in the meantime).
 */
export async function planTicketDeposits(
  tx: Tx,
  input: {
    shopId: string;
    ticketId: string;
    customerId: string;
    totalCents: number;
  },
): Promise<DepositPlan> {
  if (input.totalCents <= 0) return NO_DEPOSITS;

  const deposits = await tx.deposit.findMany({
    where: {
      shopId: input.shopId,
      ticketId: input.ticketId,
      appliedInvoiceId: null,
      refundedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, amountCents: true },
  });
  if (deposits.length === 0) return NO_DEPOSITS;

  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, shopId: input.shopId },
    select: { creditBalanceCents: true },
  });
  if (!customer) return NO_DEPOSITS;

  const held = deposits.reduce((sum, row) => sum + row.amountCents, 0);
  const amountCents = Math.min(
    held,
    input.totalCents,
    customer.creditBalanceCents,
  );
  if (amountCents <= 0) return NO_DEPOSITS;

  return { amountCents, depositIds: deposits.map((row) => row.id) };
}

/**
 * Spends a planned deposit against the invoice just raised: the balance comes
 * down, the ledger records why, a CREDIT payment lands on the invoice and every
 * deposit on the ticket is stamped with the invoice that consumed it.
 *
 * Every deposit is marked consumed even when only part of the money landed: it
 * left the deposit pot either way, and the remainder stays on the customer's
 * account rather than dangling on the ticket.
 */
export async function commitTicketDeposits(
  tx: Tx,
  plan: DepositPlan,
  input: {
    shopId: string;
    customerId: string;
    ticketNumber: number;
    invoiceId: string;
    invoiceNumber: number;
    userId: string | null;
  },
): Promise<void> {
  if (plan.amountCents <= 0 || plan.depositIds.length === 0) return;

  await tx.customer.update({
    where: { id: input.customerId },
    data: { creditBalanceCents: { decrement: plan.amountCents } },
  });

  await recordCreditSpend(tx, {
    shopId: input.shopId,
    customerId: input.customerId,
    amountCents: plan.amountCents,
    invoiceNumber: input.invoiceNumber,
    userId: input.userId,
  });

  await tx.payment.create({
    data: {
      shopId: input.shopId,
      invoiceId: input.invoiceId,
      amountCents: plan.amountCents,
      method: "CREDIT",
      reference: `Deposit on ticket #${input.ticketNumber}`,
      takenById: input.userId,
    },
  });

  await tx.deposit.updateMany({
    where: { id: { in: plan.depositIds }, shopId: input.shopId },
    data: { appliedInvoiceId: input.invoiceId },
  });
}

/** Plan and commit in one call — what the ticket → invoice action needs. */
export async function applyTicketDeposits(
  tx: Tx,
  input: {
    shopId: string;
    ticketId: string;
    customerId: string;
    ticketNumber: number;
    invoiceId: string;
    invoiceNumber: number;
    totalCents: number;
    userId: string | null;
  },
): Promise<DepositPlan> {
  const plan = await planTicketDeposits(tx, input);
  await commitTicketDeposits(tx, plan, input);
  return plan;
}
