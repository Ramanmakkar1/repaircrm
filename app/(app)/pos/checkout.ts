import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { verifyPosTerminalIntent } from "@/lib/payments";
import { withNextNumber } from "@/lib/sequence";
import type { CheckoutInput, CheckoutResult, TenderMethod } from "@/components/pos/types";

/**
 * The POS sale itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN actions.ts
 * ---------------------------------------------------------------------------
 * A `"use server"` module publishes every export as a callable endpoint. If
 * this function lived there, a POST could invoke it with any `shopId` it liked
 * and walk straight past the session. Keeping it in a plain server module means
 * the ONLY way in is through `checkoutAction`, which resolves the tenant from
 * the session cookie first. It also makes the transaction directly testable
 * without minting a request context.
 *
 * ---------------------------------------------------------------------------
 * TRUST MODEL
 * ---------------------------------------------------------------------------
 * The cart arrives from the browser, so it is a list of *intents*, not prices:
 *
 *   · catalogue lines — the client sends `productId` + `quantity` and nothing
 *     else is believed. Name, unit price and taxability are re-read from the
 *     database inside the transaction, scoped to `shopId`, so a forged price or
 *     a product belonging to another tenant cannot reach an invoice.
 *   · custom lines    — a typed-at-the-counter item has no catalogue row, so
 *     its price genuinely comes from the client. It is clamped to >= 0 and its
 *     description trimmed and length-capped.
 *   · ticket lines    — the client sends `ticketChargeId` and nothing else is
 *     believed. Description, quantity, price and taxability all come from the
 *     TicketCharge row, which must belong to this shop and must not already be
 *     invoiced.
 *
 * ---------------------------------------------------------------------------
 * TICKET LINES (POS ↔ TICKETS)
 * ---------------------------------------------------------------------------
 * A repair finishes at the bench and the customer pays at the counter, so the
 * register can pull a ticket's un-invoiced charges straight into the sale.
 * Three rules hold that together:
 *
 *   1. ONE TICKET PER SALE. `Invoice.ticketId` is a single column; billing two
 *      repairs on one receipt would leave one of them unlinked. Enforced in the
 *      UI (the picker disables itself) AND here, as an error.
 *
 *   2. THE TICKET OWNS THE CUSTOMER. When ticket lines are present the invoice
 *      is addressed to the TICKET's customer, whatever the client sent. An
 *      invoice that links back to ticket #N and bills someone else is a lie.
 *
 *   3. TICKET LINES DO NOT MOVE STOCK. A catalogue line at the register is a
 *      part leaving the shelf right now, so it decrements. A ticket charge is
 *      work ALREADY DONE — the part went into the customer's device on the
 *      bench days ago, and its stock left through parts-receiving or an
 *      inventory adjustment at that time. Decrementing again here would count
 *      the same physical part out of stock twice. Services and labour have no
 *      stock to move at all. See the loop at the bottom of the transaction.
 *
 * ---------------------------------------------------------------------------
 * ATOMICITY
 * ---------------------------------------------------------------------------
 * Everything a completed sale implies happens in ONE interactive transaction:
 * the invoice and its lines, the payment, every stock decrement, every
 * StockAdjustment audit row, and (for CREDIT) the customer's credit draw-down.
 * If any step fails the whole sale rolls back and no stock moves.
 *
 * `withNextNumber` wraps that transaction rather than sitting inside it: the
 * number is allocated in its own short read, and if two registers race for the
 * same invoice number the DB's @@unique([shopId, number]) rejects the loser,
 * the entire transaction rolls back, and the sale retries with a fresh number.
 * Allocating inside the transaction would keep the read atomic but give up that
 * retry.
 */

export const WALK_IN = { firstName: "Walk-in", lastName: "Customer" } as const;

const METHODS = ["CASH", "CARD", "CHECK", "OTHER", "CREDIT"] as const;

const lineSchema = z.object({
  productId: z.string().min(1).nullable(),
  description: z.string().trim().max(500),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  taxable: z.boolean(),
  quantity: z.number().int().min(1).max(10_000),
  ticketChargeId: z.string().min(1).nullable().optional().default(null),
});

const checkoutSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add something to the cart first."),
  customerId: z.string().min(1).nullable(),
  method: z.enum(METHODS),
  reference: z.string().trim().max(200).nullable(),
  tenderedCents: z.number().int().min(0).max(100_000_000).nullable(),
  /**
   * Set when the card was already presented to a Stripe Terminal reader. It is
   * a CLAIM, not a receipt: `performCheckout` retrieves the intent from Stripe
   * and refuses the sale unless Stripe agrees on the shop and the amount.
   */
  terminalPaymentIntentId: z.string().trim().min(1).nullable().optional().default(null),
});

/** Errors safe to show at the counter. Anything else becomes a generic message. */
export class SaleError extends Error {}

type Tx = Prisma.TransactionClient;

/** A line as it will actually be written, after server-side price resolution. */
type ResolvedLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  /**
   * Set on lines that came off a repair ticket. Two things key off it: the
   * charge row gets stamped with the new invoiceId, and the stock loop skips
   * the line (rule 3 in the header — the part already left stock at the bench).
   */
  ticketChargeId: string | null;
};

/** The tenant + operator identity, always resolved from the session by the caller. */
export type SaleContext = { shopId: string; userId: string };

/**
 * Everything a sale's PRICES depend on, resolved from the database.
 *
 * Split out of `performCheckout` so the card-reader flow can price a cart
 * BEFORE the sale exists: at the register the invoice is not written until the
 * money is taken, so the reader has to be shown an amount, and that amount must
 * come from here rather than from the register's own arithmetic. Both callers
 * therefore run the identical trust model described in this file's header.
 *
 * Takes a `Tx` so `performCheckout` can call it inside its transaction and
 * `priceCart` can call it with the plain client for a read-only quote.
 */
async function resolveSale(
  tx: Tx,
  shopId: string,
  sale: z.infer<typeof checkoutSchema>,
) {
  // ----------------------------------------------- authoritative prices
  const productIds = [
    ...new Set(
      sale.lines
        .map((line) => line.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const products = productIds.length
    ? await tx.product.findMany({
        // Scoped to the session's shop: an id from another tenant simply
        // does not come back, and the check below turns that into an error.
        where: { id: { in: productIds }, shopId },
        select: { id: true, name: true, priceCents: true, taxable: true },
      })
    : [];

  const byId = new Map(products.map((p) => [p.id, p]));
  if (byId.size !== productIds.length) {
    throw new SaleError(
      "One of those products is no longer available. Refresh the register.",
    );
  }

  // ------------------------------------------------- ticket charges
  // Re-read from the database, scoped to this shop AND to invoiceId:
  // null. A charge someone else already billed while this cart sat open
  // simply does not come back, and the count check below turns that into
  // a refusal rather than a silent double-charge.
  const ticketChargeIds = [
    ...new Set(
      sale.lines
        .map((line) => line.ticketChargeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const ticketCharges = ticketChargeIds.length
    ? await tx.ticketCharge.findMany({
        where: { id: { in: ticketChargeIds }, shopId, invoiceId: null },
        select: {
          id: true,
          ticketId: true,
          productId: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
          ticket: { select: { id: true, number: true, customerId: true } },
        },
      })
    : [];

  const chargeById = new Map(ticketCharges.map((c) => [c.id, c]));
  if (chargeById.size !== ticketChargeIds.length) {
    throw new SaleError(
      "Some of that ticket's charges have already been invoiced. Refresh the register.",
    );
  }

  // Rule 1: one ticket per sale.
  const ticketIds = [...new Set(ticketCharges.map((c) => c.ticketId))];
  if (ticketIds.length > 1) {
    throw new SaleError(
      "One sale can only bill one ticket. Ring the second repair up separately.",
    );
  }
  const billedTicket = ticketCharges[0]?.ticket ?? null;

  const lines: ResolvedLine[] = sale.lines.map((line) => {
    if (line.ticketChargeId) {
      // The bench already agreed these numbers with the customer, so the
      // charge row — not the cart — is the price of record.
      const charge = chargeById.get(line.ticketChargeId)!;
      return {
        productId: charge.productId,
        description: `Ticket #${charge.ticket.number} — ${charge.description}`,
        quantity: charge.quantity,
        unitPriceCents: charge.unitPriceCents,
        taxable: charge.taxable,
        ticketChargeId: charge.id,
      };
    }
    if (line.productId) {
      const product = byId.get(line.productId)!;
      return {
        productId: product.id,
        description: product.name,
        quantity: line.quantity,
        unitPriceCents: product.priceCents,
        taxable: product.taxable,
        ticketChargeId: null,
      };
    }
    const description = line.description.trim();
    if (!description) {
      throw new SaleError("Every custom item needs a description.");
    }
    return {
      productId: null,
      description,
      quantity: line.quantity,
      unitPriceCents: Math.max(0, line.unitPriceCents),
      taxable: line.taxable,
      ticketChargeId: null,
    };
  });

  // ------------------------------------------------------------ totals
  const shop = await tx.shop.findUnique({
    where: { id: shopId },
    select: { taxRateBps: true },
  });
  const taxRateBps = shop?.taxRateBps ?? 0;
  const totals = calcTotals(lines, taxRateBps);

  if (totals.totalCents <= 0) {
    throw new SaleError("This sale comes to nothing — add a priced item.");
  }

  return { lines, totals, taxRateBps, billedTicket, ticketChargeIds };
}

/**
 * What this cart comes to, priced by the server.
 *
 * Read-only: nothing is written, no stock moves, no invoice is created. Used by
 * the POS card-reader flow to open a PaymentIntent for the right amount. The
 * figure is checked again inside the sale transaction against what Stripe
 * actually took, so a cart edited between the two steps is refused rather than
 * charged at the old price.
 */
export async function priceCart(
  shopId: string,
  input: CheckoutInput,
): Promise<{ ok: true; totalCents: number } | { ok: false; error: string }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That sale is not valid.",
    };
  }

  try {
    const { totals } = await resolveSale(db, shopId, parsed.data);
    return { ok: true, totalCents: totals.totalCents };
  } catch (error) {
    if (error instanceof SaleError) return { ok: false, error: error.message };
    console.error("[pos] pricing failed", error);
    return { ok: false, error: "Could not price that cart." };
  }
}

export async function performCheckout(
  { shopId, userId }: SaleContext,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That sale is not valid.",
    };
  }
  const sale = parsed.data;

  // -------------------------------------------------------- card reader ----
  // Verified BEFORE the transaction, because it is a network round trip and a
  // Stripe call inside an interactive transaction holds a lock open for as
  // long as Stripe feels like taking. What comes back is the amount STRIPE
  // says it took, which is compared against the server-priced cart below.
  let terminal: { intentId: string; chargeId: string | null; amountCents: number } | null =
    null;
  if (sale.terminalPaymentIntentId) {
    if (sale.method !== "CARD") {
      return { ok: false, error: "A reader payment has to be tendered as a card." };
    }
    const verified = await verifyPosTerminalIntent({
      shopId,
      paymentIntentId: sale.terminalPaymentIntentId,
    });
    if (!verified.ok) return { ok: false, error: verified.reason };
    terminal = verified;
  }

  try {
    const result = await withNextNumber(shopId, "invoice", (number) =>
      db.$transaction(async (tx) => {
        // Prices, ticket charges and totals — all re-read from the database,
        // never believed from the cart. See `resolveSale` above.
        const { lines, totals, taxRateBps, billedTicket, ticketChargeIds } =
          await resolveSale(tx, shopId, sale);

        if (terminal) {
          // The cart is priced from the catalogue; the card was charged for
          // whatever it was priced at a moment ago. If somebody added a line
          // in between, refuse rather than ring up a sale for more than the
          // customer's card actually paid.
          if (terminal.amountCents !== totals.totalCents) {
            throw new SaleError(
              `The reader took ${formatCents(terminal.amountCents)} but this cart now comes to ${formatCents(totals.totalCents)}. Refund that payment in Stripe and ring the sale up again.`,
            );
          }
          // Double-submit guard: the same approved card payment must not be
          // able to create a second invoice.
          const already = await tx.payment.findFirst({
            where: { shopId, stripePaymentIntentId: terminal.intentId },
            select: { invoice: { select: { number: true } } },
          });
          if (already) {
            throw new SaleError(
              `That card payment was already rung up as invoice #${already.invoice.number}.`,
            );
          }
        }

        // ---------------------------------------------------------- customer
        // Rule 2: a ticket owns the customer on its own invoice. The register
        // already attaches them, but re-deriving it here means a tampered or
        // stale client cannot bill Ticket #12's repair to someone else.
        const customerId = billedTicket
          ? billedTicket.customerId
          : await resolveCustomerId(tx, shopId, sale.customerId);

        // ------------------------------------------------------ store credit
        // Drawing credit down and writing the payment must succeed or fail
        // together, so it happens inside the transaction, not before it.
        if (sale.method === "CREDIT") {
          if (!sale.customerId && !billedTicket) {
            throw new SaleError("Attach a customer before paying with store credit.");
          }
          const customer = await tx.customer.findFirst({
            where: { id: customerId, shopId },
            select: { id: true, creditBalanceCents: true },
          });
          if (!customer) throw new SaleError("That customer no longer exists.");
          if (customer.creditBalanceCents < totals.totalCents) {
            throw new SaleError(
              `Only ${formatCents(customer.creditBalanceCents)} of store credit is available — short of the ${formatCents(totals.totalCents)} total.`,
            );
          }
          await tx.customer.update({
            where: { id: customer.id },
            data: { creditBalanceCents: { decrement: totals.totalCents } },
          });
        }

        // ---------------------------------------------------------- the sale
        // A counter sale is paid the moment it is rung up, so it is born PAID
        // with the tax rate snapshotted — a later settings change must not
        // restate a receipt the customer is already holding.
        const invoice = await tx.invoice.create({
          data: {
            shopId,
            customerId,
            // The invoice↔ticket link, so the repair is reachable from the
            // receipt and the ticket page shows the money it brought in.
            ticketId: billedTicket?.id ?? null,
            number,
            status: "PAID",
            paidAt: new Date(),
            taxRateBps,
            lines: {
              create: lines.map((line, index) => ({
                productId: line.productId,
                description: line.description,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
                taxable: line.taxable,
                sortOrder: index,
              })),
            },
          },
          select: { id: true, number: true },
        });

        // The payment records what the sale was worth, never what the customer
        // handed over: a $100 bill against a $23 sale is a $23 payment plus
        // change, not a $77 overpayment.
        await tx.payment.create({
          data: {
            shopId,
            invoiceId: invoice.id,
            amountCents: totals.totalCents,
            method: sale.method as TenderMethod,
            reference: terminal
              ? terminal.intentId
              : buildReference(sale.method, sale.reference, sale.tenderedCents),
            takenById: userId,
            // Only set on a reader sale. These are what tie the till back to a
            // Stripe payout, and what let a refund be pushed to the card later
            // instead of being handed back out of the drawer.
            stripePaymentIntentId: terminal?.intentId ?? null,
            stripeChargeId: terminal?.chargeId ?? null,
            stripeSource: terminal ? "terminal" : null,
          },
        });

        // ---------------------------------------------- close out the ticket
        if (billedTicket) {
          // Stamping `invoiceId` is what makes these charges read-only on the
          // ticket and invisible to the next POS sale — the same mechanism
          // makeInvoiceAction uses. Scoped by shopId so a forged id from
          // another tenant matches nothing.
          await tx.ticketCharge.updateMany({
            where: { id: { in: ticketChargeIds }, shopId, invoiceId: null },
            data: { invoiceId: invoice.id },
          });

          // A private note, not a customer-facing update: this is bookkeeping
          // for the shop, and the customer is standing at the counter holding
          // the receipt already.
          await tx.ticketComment.create({
            data: {
              shopId,
              ticketId: billedTicket.id,
              authorId: userId,
              body: `Invoice #${invoice.number} created at POS.`,
              isPublic: false,
              updateType: "Invoiced",
              channel: "NOTE",
            },
          });
        }

        // ----------------------------------------------- stock + audit trail
        // Products were verified as belonging to this shop above, so updating
        // by id is already tenant-safe. Stock is allowed to go negative: the
        // counter must never be blocked by a stale count, and the adjustment
        // history is what makes the discrepancy findable afterwards.
        //
        // TICKET LINES ARE SKIPPED (rule 3 in the header). A ticket charge is
        // work already performed: any part in it physically left the shelf on
        // the bench, and its stock movement was recorded then — by receiving a
        // part order, or by an inventory adjustment. Decrementing again at the
        // till would count one physical part out of stock twice and quietly
        // corrupt the on-hand number. Labour and diagnostic fees have no stock
        // at all. The `productId` on a ticket charge is kept for traceability
        // only; it is deliberately NOT a signal to move stock here.
        for (const line of lines) {
          if (line.ticketChargeId) continue;
          if (!line.productId) continue;
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: { decrement: line.quantity } },
          });
          await tx.stockAdjustment.create({
            data: {
              shopId,
              productId: line.productId,
              delta: -line.quantity,
              reason: "Sold — POS",
              userId,
            },
          });
        }

        const changeDueCents =
          sale.method === "CASH" && sale.tenderedCents != null
            ? Math.max(0, sale.tenderedCents - totals.totalCents)
            : 0;

        return {
          invoiceId: invoice.id,
          number: invoice.number,
          totalCents: totals.totalCents,
          changeDueCents,
          ticketId: billedTicket?.id ?? null,
          ticketNumber: billedTicket?.number ?? null,
        };
      }),
    );

    return { ok: true, ...result, method: sale.method };
  } catch (error) {
    if (error instanceof SaleError) return { ok: false, error: error.message };
    console.error("[pos] checkout failed", error);
    return { ok: false, error: "Could not complete that sale. Nothing was charged." };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the customer the invoice is addressed to.
 *
 * A walk-in still needs a Customer row (Invoice.customerId is required), so
 * every shop gets exactly one "Walk-in Customer" placeholder, created on the
 * first anonymous sale and reused forever after. The oldest match wins, so a
 * rare double-create under concurrency converges instead of forking.
 */
async function resolveCustomerId(
  tx: Tx,
  shopId: string,
  requested: string | null,
): Promise<string> {
  if (requested) {
    const customer = await tx.customer.findFirst({
      where: { id: requested, shopId },
      select: { id: true },
    });
    if (!customer) throw new SaleError("That customer no longer exists.");
    return customer.id;
  }

  const existing = await tx.customer.findFirst({
    where: { shopId, firstName: WALK_IN.firstName, lastName: WALK_IN.lastName },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.customer.create({
    data: {
      shopId,
      firstName: WALK_IN.firstName,
      lastName: WALK_IN.lastName,
      notes: "Placeholder for anonymous counter sales.",
      emailOptIn: false,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * What goes in `Payment.reference`.
 *
 * For cash we record what was handed over, so the invoice screen explains the
 * change that came out of the drawer. Other tenders carry whatever the cashier
 * typed (check number, auth code, last four).
 */
function buildReference(
  method: string,
  typed: string | null,
  tenderedCents: number | null,
): string | null {
  if (method === "CASH" && tenderedCents != null && tenderedCents > 0) {
    return `Tendered ${formatCents(tenderedCents)}`;
  }
  const trimmed = typed?.trim();
  return trimmed ? trimmed : null;
}
