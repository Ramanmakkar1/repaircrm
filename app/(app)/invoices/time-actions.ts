"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readLabourSettings } from "@/lib/labour";
import { labourLinesFor, loadBillableTime } from "@/lib/time-billing";

/**
 * "That invoice is missing the hour I logged after it was raised."
 *
 * Time keeps accruing on a ticket after somebody presses Make Invoice, so the
 * invoice screen offers to sweep whatever is unbilled onto the document it is
 * already showing. Same lines, same rounding, same rate as the ticket → invoice
 * path (both go through lib/time-billing.ts), so a labour line reads the same
 * whichever route raised it.
 *
 * Only an editable invoice: a paid or void document is a settled record, and
 * quietly growing it would restate something the customer has already seen.
 */

export type AddTimeResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const EDITABLE = ["DRAFT", "SENT"] as const;
class TimeChangedError extends Error {}

export async function addTimeToInvoiceAction(
  invoiceId: string,
): Promise<AddTimeResult> {
  const { shopId } = await requireUser();

  if (typeof invoiceId !== "string" || !invoiceId) {
    return { ok: false, error: "That invoice no longer exists." };
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      ticketId: true,
      _count: { select: { lines: true } },
    },
  });
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (!invoice.ticketId) {
    return { ok: false, error: "This invoice is not linked to a ticket." };
  }
  const ticketId = invoice.ticketId;
  if (!EDITABLE.includes(invoice.status as "DRAFT" | "SENT")) {
    return {
      ok: false,
      error: `A ${invoice.status.toLowerCase()} invoice cannot take new lines.`,
    };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true, timezone: true },
  });
  const labour = readLabourSettings(shop?.settings);

  const entries = await loadBillableTime(db, shopId, invoice.ticketId);
  if (entries.length === 0) {
    return { ok: false, error: "There is no unbilled time on this ticket." };
  }

  const lines = labourLinesFor(entries, labour, shop?.timezone ?? "UTC");
  const startOrder = invoice._count.lines;

  try {
    await db.$transaction(async (tx) => {
      // Claim the entries before creating lines. A conditional update alone
      // does not protect billing if its count is ignored after lines are written.
      const claimed = await tx.timeEntry.updateMany({
        where: {
          id: { in: entries.map((entry) => entry.id) },
          shopId,
          ticketId,
          billable: true,
          endedAt: { not: null },
          invoiceId: null,
        },
        data: { invoiceId: invoice.id },
      });
      if (claimed.count !== entries.length) throw new TimeChangedError();

      await tx.invoiceLine.createMany({
        data: lines.map((line, index) => ({
          invoiceId: invoice.id,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          taxable: line.taxable,
          sortOrder: startOrder + index,
        })),
      });
    });
  } catch (error) {
    // Throwing inside the transaction also rolls back any partial claim.
    if (error instanceof TimeChangedError) {
      return { ok: false, error: "That time changed or was already billed. Refresh and try again." };
    }
    throw error;
  }

  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath("/invoices");
  revalidatePath(`/tickets/${invoice.ticketId}`);

  return {
    ok: true,
    message: `${lines.length} labour line${lines.length === 1 ? "" : "s"} added to invoice #${invoice.number}.`,
  };
}
