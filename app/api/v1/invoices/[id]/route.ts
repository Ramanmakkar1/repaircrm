import { z } from "zod";

import { db } from "@/lib/db";
import { emitInvoiceEvent } from "@/lib/events";
import { withApiKey } from "../../_lib/handler";
import { isoDate } from "../../_lib/schema";
import {
  apiError,
  apiItem,
  noFieldsError,
  readJson,
  zodError,
} from "../../_lib/respond";
import { invoiceSelect, serialiseInvoiceDetail } from "../../_lib/shapes";

/**
 * /api/v1/invoices/{id}
 *
 *   GET     lines, payments and computed totals
 *   PATCH   notes, due date, and DRAFT -> SENT
 *   DELETE  VOIDS the invoice — see the note on DELETE below
 *
 * The totals come from lib/money.ts `invoiceTotals` — the same function the
 * invoice screen, the print sheet and the statement use, so an integration can
 * never disagree with the paper.
 *
 * An invoice id from another shop answers 404, not 403.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId: auth.shopId },
    select: invoiceSelect,
  });

  if (!invoice) return apiError("not_found", "No invoice with that id.");

  return apiItem(serialiseInvoiceDetail(invoice));
});

/**
 * Lines are NOT patchable, deliberately.
 *
 * Rewriting the lines of an invoice a customer has already been shown is the
 * kind of edit that has to leave a trail; the UI enforces "void it and raise a
 * new one" for anything past DRAFT, and an API that quietly restated a SENT
 * invoice would be a way around that rule rather than a feature.
 *
 * `status: "SENT"` marks the invoice as issued WITHOUT emailing anything. It is
 * for the shop that sends invoices through their own system — the send flow
 * with its templates and outbox row stays in the app.
 */
const patchSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  status: z.literal("SENT").optional(),
});

export const PATCH = withApiKey<Params>(async (request, auth, { params }) => {
  const { id } = await params;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  if (Object.keys(input).length === 0) {
    return noFieldsError(["notes", "dueDate", 'status ("SENT")']);
  }

  const invoice = await db.invoice.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, status: true },
  });
  if (!invoice) return apiError("not_found", "No invoice with that id.");

  if (invoice.status === "VOID") {
    return apiError("invalid_request", "This invoice is void and cannot be edited.");
  }
  if (input.status === "SENT" && invoice.status !== "DRAFT") {
    return apiError(
      "invalid_request",
      `Only a draft can be marked sent — this one is ${invoice.status}.`,
    );
  }

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.dueDate === undefined
        ? {}
        : { dueDate: input.dueDate === null ? null : new Date(input.dueDate) }),
      ...(input.status === undefined ? {} : { status: input.status }),
    },
  });

  const updated = await db.invoice.findFirst({
    where: { id: invoice.id, shopId: auth.shopId },
    select: invoiceSelect,
  });
  if (!updated) return apiError("not_found", "No invoice with that id.");

  return apiItem(serialiseInvoiceDetail(updated));
});

/**
 * DELETE VOIDS. It does not remove the row.
 *
 * An invoice is a numbered document in a per-shop sequence, and a sequence with
 * a hole in it is a bookkeeping problem nobody can reconstruct later. So DELETE
 * does what the owner's Void button does — and follows the same two rules:
 *
 *   · money has changed hands  -> refused, because voiding would orphan the
 *                                 payment history
 *   · already void             -> refused, so a retry is not a second event
 *
 * The response says `voided: true` rather than `deleted: true`, because telling
 * a caller a row was deleted when it is still there is how integrations end up
 * with two copies of an invoice.
 */
export const DELETE = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, status: true, _count: { select: { payments: true } } },
  });
  if (!invoice) return apiError("not_found", "No invoice with that id.");

  if (invoice.status === "VOID") {
    return apiError("invalid_request", "This invoice is already void.");
  }
  if (invoice._count.payments > 0) {
    return apiError(
      "invalid_request",
      "This invoice has payments against it. Refund them before voiding it.",
    );
  }

  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: "VOID", paidAt: null },
  });

  await emitInvoiceEvent(auth.shopId, "invoice.voided", invoice.id);

  return apiItem({ id: invoice.id, voided: true, status: "VOID" });
});
