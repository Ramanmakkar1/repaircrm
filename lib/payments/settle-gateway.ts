import { db } from "@/lib/db";
import { emitInvoiceEvent, emitPaymentEvent } from "@/lib/events";
import { invoiceTotals } from "@/lib/money";
import type { SettleOutcome } from "./settle";

export type GatewaySettleInput = {
  provider: string;
  shopId: string;
  invoiceId: string;
  amountCents: number;
  paymentId: string;
  chargeId?: string | null;
  source: string;
  reference?: string | null;
  takenById?: string | null;
};

/** Records a confirmed non-Stripe payment exactly once. */
export async function settleGatewayPayment(input: GatewaySettleInput): Promise<SettleOutcome> {
  const amountCents = Math.round(input.amountCents);
  const provider = input.provider.trim().toLowerCase();
  const paymentId = input.paymentId.trim();
  if (!provider || !paymentId || !input.shopId || !input.invoiceId) {
    return { status: "ignored", reason: "incomplete settlement" };
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "ignored", reason: "no amount to record" };
  }

  let outcome: SettleOutcome;
  try {
    outcome = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, shopId: input.shopId },
        select: {
          id: true,
          status: true,
          taxRateBps: true,
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
        },
      });
      if (!invoice) return { status: "ignored" as const, reason: "invoice not found for that shop" };

      const existing = await tx.payment.findFirst({
        where: {
          invoiceId: invoice.id,
          OR: [
            { gateway: provider, gatewayPaymentId: paymentId },
            ...(input.reference ? [{ reference: input.reference }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing) return { status: "ignored" as const, reason: "already recorded" };
      if (invoice.status === "VOID") {
        console.error(`[payments] ${provider} payment ${paymentId} reached VOID invoice ${invoice.id}`);
        return { status: "ignored" as const, reason: "invoice is void" };
      }

      const totals = invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments);
      const balanceAfter = totals.balanceCents - amountCents;
      const nextStatus = balanceAfter <= 0 ? "PAID" : "PARTIAL";
      const payment = await tx.payment.create({
        data: {
          shopId: input.shopId,
          invoiceId: invoice.id,
          amountCents,
          method: "CARD",
          reference: input.reference || paymentId,
          gateway: provider,
          gatewayPaymentId: paymentId,
          gatewayChargeId: input.chargeId ?? null,
          gatewaySource: input.source,
          takenById: input.takenById ?? null,
        },
        select: { id: true },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus, paidAt: balanceAfter <= 0 ? new Date() : null },
      });
      return { status: "recorded" as const, paymentId: payment.id, invoiceStatus: nextStatus };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error(`[payments] failed to settle ${provider} payment:`, error);
    return { status: "error", reason: error instanceof Error ? error.message : "write failed" };
  }

  if (outcome.status === "recorded") {
    await emitPaymentEvent(input.shopId, outcome.paymentId);
    if (outcome.invoiceStatus === "PAID") {
      await emitInvoiceEvent(input.shopId, "invoice.paid", input.invoiceId);
    }
  }
  return outcome;
}
