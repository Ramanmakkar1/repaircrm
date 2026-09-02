import { z } from "zod";

import { db } from "@/lib/db";
import { withNextNumber } from "@/lib/sequence";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { cents, isoDate } from "../_lib/schema";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { estimateSelect, serialiseEstimate } from "../_lib/shapes";

const STATUSES = ["DRAFT", "SENT", "APPROVED", "DECLINED", "CONVERTED"] as const;
type EstimateStatus = (typeof STATUSES)[number];

/**
 * /api/v1/estimates
 *
 *   GET  ?page=|?cursor=&status=&customerId=
 *   POST create (always DRAFT)
 *
 * A created estimate is always a DRAFT, whatever the caller asks for. Approving
 * one is a customer's act — it is what the signature on the portal page is
 * evidence of — so an API cannot manufacture an approval, only the shop's own
 * approve/decline flow can. The same reasoning keeps `publicToken` out of the
 * payload: it is the customer's bearer link, not the integration's.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const statusRaw = queryParam(url, "status")?.toUpperCase();
  const customerId = queryParam(url, "customerId");

  if (statusRaw && !STATUSES.includes(statusRaw as EstimateStatus)) {
    return apiError("invalid_request", `status must be one of ${STATUSES.join(", ")}.`);
  }

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(statusRaw ? { status: statusRaw as EstimateStatus } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.estimate.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: estimateSelect,
    }),
    db.estimate.count({ where }),
  ]);

  return listResponse(rows, serialiseEstimate, plan, total);
});

const lineSchema = z.object({
  description: z.string().trim().min(1, "Each line needs a description").max(300),
  quantity: z.number().int().positive().max(10_000).optional(),
  unitPriceCents: cents,
  taxable: z.boolean().optional(),
  productId: z.string().trim().optional(),
});

const createSchema = z.object({
  customerId: z.string().trim().min(1, "Customer id is required"),
  ticketId: z.string().trim().optional(),
  notes: z.string().max(5000).optional(),
  expiresAt: isoDate.optional(),
  lines: z.array(lineSchema).min(1, "An estimate needs at least one line").max(200),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const customer = await db.customer.findFirst({
    where: { id: input.customerId, shopId: auth.shopId },
    select: { id: true },
  });
  if (!customer) return apiError("not_found", "No customer with that id.");

  if (input.ticketId) {
    const ticket = await db.ticket.findFirst({
      where: { id: input.ticketId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!ticket) return apiError("not_found", "No ticket with that id.");
  }

  const shop = await db.shop.findUnique({
    where: { id: auth.shopId },
    select: { taxRateBps: true },
  });

  try {
    const estimate = await withNextNumber(auth.shopId, "estimate", (number) =>
      db.estimate.create({
        data: {
          shopId: auth.shopId,
          customerId: customer.id,
          ticketId: input.ticketId ?? null,
          number,
          status: "DRAFT",
          // Snapshot today's rate — a later settings change must not silently
          // restate a quote the customer has already been shown.
          taxRateBps: shop?.taxRateBps ?? 0,
          notes: input.notes ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          lines: {
            create: input.lines.map((line, index) => ({
              productId: line.productId ?? null,
              description: line.description,
              quantity: line.quantity ?? 1,
              unitPriceCents: line.unitPriceCents,
              taxable: line.taxable ?? true,
              sortOrder: index,
            })),
          },
        },
        select: estimateSelect,
      }),
    );

    return apiItem(serialiseEstimate(estimate), 201);
  } catch {
    return apiError("server_error", "Could not create that estimate.");
  }
});
