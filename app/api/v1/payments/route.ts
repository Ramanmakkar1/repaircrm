import { z } from "zod";

import { db } from "@/lib/db";
import { recordPayment } from "@/lib/payments/record";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { paymentSelect, serialisePayment } from "../_lib/shapes";

/**
 * /api/v1/payments
 *
 *   GET   ?page=|?cursor=&invoiceId=&since=   money in, newest first
 *   POST                                      record a manual payment
 *
 * `since` is what a nightly accounting sync actually wants: "everything that
 * came in after the last row I saw". Combined with `cursor` it is a resumable
 * export.
 *
 * There is no PATCH and no DELETE. PAYMENTS ARE APPEND-ONLY — the money came
 * in, and that is a fact the till has to be able to show forever. Handing some
 * of it back is a Refund, which is its own row so that "collected" and
 * "returned" stay separately reportable.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const invoiceId = queryParam(url, "invoiceId");
  const since = queryParam(url, "since");

  if (since && Number.isNaN(Date.parse(since))) {
    return apiError("invalid_request", "since must be an ISO 8601 date or date-time.");
  }

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(invoiceId ? { invoiceId } : {}),
    // `AND` rather than a second `createdAt` key: in cursor mode `plan.where`
    // already carries a createdAt predicate, and one of the two would win.
    ...(since ? { AND: [{ createdAt: { gte: new Date(since) } }] } : {}),
  };

  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: paymentSelect,
    }),
    db.payment.count({ where }),
  ]);

  return listResponse(rows, serialisePayment, plan, total);
});

/**
 * `CREDIT` is accepted, and it does what it does at the counter: draws the
 * customer's stored credit down inside the same transaction. An integration
 * applying credit it does not have gets the same refusal a cashier would.
 *
 * `createdAt` cannot be back-dated. A payment is stamped when it is recorded,
 * which is the only timestamp the shop can actually attest to.
 */
const createSchema = z.object({
  invoiceId: z.string().trim().min(1, "Invoice id is required"),
  amountCents: z.number().int().positive("Amount must be greater than zero"),
  method: z.enum(["CASH", "CARD", "CHECK", "OTHER", "CREDIT"]).optional(),
  reference: z.string().trim().max(200).optional(),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  // Scoped existence check first, so an invoice from another shop answers 404
  // like every other foreign id rather than "that invoice no longer exists".
  const invoice = await db.invoice.findFirst({
    where: { id: input.invoiceId, shopId: auth.shopId },
    select: { id: true },
  });
  if (!invoice) return apiError("not_found", "No invoice with that id.");

  // Same settlement path as the counter form — see lib/payments/record.ts.
  const result = await recordPayment({
    shopId: auth.shopId,
    invoiceId: input.invoiceId,
    amountCents: input.amountCents,
    method: input.method ?? "OTHER",
    reference: input.reference ?? null,
    // Nobody stood at a counter for this one.
    takenById: null,
  });

  // Everything that can still refuse here — void invoice, no lines, over the
  // balance, not enough store credit — is something the caller sent wrong, and
  // the sentence is the same one the cashier would read.
  if (!result.ok) return apiError("invalid_request", result.error);

  const payment = await db.payment.findFirst({
    where: { id: result.paymentId, shopId: auth.shopId },
    select: paymentSelect,
  });
  if (!payment) return apiError("server_error", "The payment could not be read back.");

  return apiItem(serialisePayment(payment), 201);
});
