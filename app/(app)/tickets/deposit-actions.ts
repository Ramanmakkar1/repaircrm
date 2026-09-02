"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/comms";
import { db } from "@/lib/db";
import { formatCents, parseCents } from "@/lib/money";

/**
 * Deposits taken at intake.
 *
 * A deposit is money the shop is holding, so every one of these actions writes
 * the whole picture in ONE transaction — the Deposit row, the customer's credit
 * balance, the CreditAdjustment explaining the move, and the ticket's cached
 * total. Half of that landing is worse than none of it.
 *
 * ROLE RULES
 *   Take a deposit      OWNER + FRONT_DESK   (it happens at the counter)
 *   Refund a deposit    OWNER                (money leaving the shop)
 *   Email a receipt     OWNER + FRONT_DESK
 *
 * See lib/deposits.ts for how a deposit is later spent against an invoice.
 */

export type DepositResult = { ok: true; message: string } | { ok: false; error: string };

/** A sane ceiling on one deposit — $100,000. A typo here is real money. */
const MAX_DEPOSIT_CENTS = 10_000_000;

const METHODS = ["CASH", "CARD", "CHECK", "OTHER"] as const;
type DepositMethod = (typeof METHODS)[number];

function asMethod(value: unknown): DepositMethod | null {
  return METHODS.includes(value as DepositMethod) ? (value as DepositMethod) : null;
}

async function tillStaff() {
  const session = await requireUser();
  if (session.role !== "OWNER" && session.role !== "FRONT_DESK") {
    return { session, denied: "Only an owner or front desk can take deposits." };
  }
  return { session, denied: null as string | null };
}

function revalidateDeposit(ticketId: string, customerId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath(`/customers/${customerId}`);
}

export async function takeDepositAction(input: {
  ticketId: string;
  /** Free text from the money input, e.g. "50" or "$50.00". */
  amount: string;
  method: string;
  reference: string;
}): Promise<DepositResult> {
  const { session, denied } = await tillStaff();
  if (denied) return { ok: false, error: denied };

  const method = asMethod(input.method);
  if (!method) return { ok: false, error: "Pick how the deposit was paid." };

  const amountCents = parseCents(input.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (amountCents > MAX_DEPOSIT_CENTS) {
    return {
      ok: false,
      error: `Deposits are capped at ${formatCents(MAX_DEPOSIT_CENTS)}.`,
    };
  }

  const ticket = await db.ticket.findFirst({
    where: { id: input.ticketId, shopId: session.shopId },
    select: { id: true, number: true, customerId: true },
  });
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };

  const reference = input.reference.trim().slice(0, 200) || null;

  await db.$transaction(async (tx) => {
    await tx.deposit.create({
      data: {
        shopId: session.shopId,
        ticketId: ticket.id,
        customerId: ticket.customerId,
        amountCents,
        method,
        reference,
        takenById: session.userId,
      },
    });

    // The money itself lives on the customer's credit balance — one pot, so a
    // deposit can be spent at the counter like any other credit.
    await tx.customer.update({
      where: { id: ticket.customerId },
      data: { creditBalanceCents: { increment: amountCents } },
    });

    await tx.creditAdjustment.create({
      data: {
        shopId: session.shopId,
        customerId: ticket.customerId,
        deltaCents: amountCents,
        reason: `Deposit on ticket #${ticket.number}`,
        userId: session.userId,
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { depositCents: { increment: amountCents } },
    });
  });

  revalidateDeposit(ticket.id, ticket.customerId);
  return {
    ok: true,
    message: `${formatCents(amountCents)} deposit recorded on ticket #${ticket.number}.`,
  };
}

/**
 * Hands a deposit back.
 *
 * Only an unapplied, unrefunded one: once it has been spent against an invoice
 * the money is on that invoice, and giving it back is a refund of the invoice
 * (see refundInvoiceAction), not of the deposit. The customer's credit has to
 * still be there too — if they have already spent it at the counter, there is
 * nothing here to return.
 */
export async function refundDepositAction(
  depositId: string,
): Promise<DepositResult> {
  const { shopId, role, userId } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only an owner can refund a deposit." };
  }
  if (typeof depositId !== "string" || !depositId) {
    return { ok: false, error: "That deposit no longer exists." };
  }

  const deposit = await db.deposit.findFirst({
    where: { id: depositId, shopId },
    select: {
      id: true,
      amountCents: true,
      ticketId: true,
      customerId: true,
      appliedInvoiceId: true,
      refundedAt: true,
      ticket: { select: { number: true } },
    },
  });
  if (!deposit) return { ok: false, error: "That deposit no longer exists." };
  if (deposit.refundedAt) {
    return { ok: false, error: "This deposit has already been refunded." };
  }
  if (deposit.appliedInvoiceId) {
    return {
      ok: false,
      error: "This deposit is already on an invoice — refund the invoice instead.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: deposit.customerId, shopId },
        select: { id: true, creditBalanceCents: true },
      });
      if (!customer) throw new Error("That customer no longer exists.");
      if (customer.creditBalanceCents < deposit.amountCents) {
        throw new Error(
          `Only ${formatCents(customer.creditBalanceCents)} of credit is left on this account — the deposit has already been spent.`,
        );
      }

      // Re-read and stamp in one write: two owners clicking refund at the same
      // moment must not both get past the guard above.
      const claimed = await tx.deposit.updateMany({
        where: { id: deposit.id, shopId, refundedAt: null, appliedInvoiceId: null },
        data: { refundedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new Error("This deposit has already been refunded.");
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: { creditBalanceCents: { decrement: deposit.amountCents } },
      });

      await tx.creditAdjustment.create({
        data: {
          shopId,
          customerId: customer.id,
          deltaCents: -deposit.amountCents,
          reason: `Deposit refunded on ticket #${deposit.ticket.number}`,
          userId,
        },
      });

      await tx.ticket.update({
        where: { id: deposit.ticketId },
        data: { depositCents: { decrement: deposit.amountCents } },
      });
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not refund that deposit.",
    };
  }

  revalidateDeposit(deposit.ticketId, deposit.customerId);
  return {
    ok: true,
    message: `${formatCents(deposit.amountCents)} deposit refunded.`,
  };
}

/**
 * Emails the customer their deposit receipt.
 *
 * Goes through `sendEmail` like every other outbound message, so it lands in
 * the customer's communication history and honours their opt-out — a receipt
 * they never got is worse than no receipt at all, and the outbox is where staff
 * find that out.
 */
export async function emailDepositReceiptAction(
  depositId: string,
): Promise<DepositResult> {
  const { session, denied } = await tillStaff();
  if (denied) return { ok: false, error: denied };

  const deposit = await db.deposit.findFirst({
    where: { id: depositId, shopId: session.shopId },
    select: {
      id: true,
      amountCents: true,
      createdAt: true,
      ticketId: true,
      customerId: true,
      customer: { select: { firstName: true, email: true } },
      ticket: { select: { number: true, subject: true } },
    },
  });
  if (!deposit) return { ok: false, error: "That deposit no longer exists." };
  if (!deposit.customer.email) {
    return { ok: false, error: "This customer has no email address on file." };
  }

  const result = await sendEmail({
    shopId: session.shopId,
    customerId: deposit.customerId,
    ticketId: deposit.ticketId,
    subject: `Deposit received — ticket #${deposit.ticket.number}`,
    body:
      `Hi ${deposit.customer.firstName},\n\n` +
      `Thanks — we've received your ${formatCents(deposit.amountCents)} deposit for ` +
      `ticket #${deposit.ticket.number} (${deposit.ticket.subject}).\n\n` +
      `It is held on your account and comes off the final bill.`,
    summary: [
      { label: "Ticket", value: `#${deposit.ticket.number}` },
      { label: "Deposit", value: formatCents(deposit.amountCents) },
      {
        label: "Received",
        value: deposit.createdAt.toISOString().slice(0, 10),
      },
    ],
    context: `Ticket #${deposit.ticket.number}`,
    portalPath: "/portal/home",
  });

  revalidatePath(`/tickets/${deposit.ticketId}`);

  if (!result.ok) {
    return { ok: false, error: `Receipt not sent — ${result.status}.` };
  }
  return { ok: true, message: `Receipt emailed to ${deposit.customer.email}.` };
}
