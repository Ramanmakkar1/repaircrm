import { z } from "zod";

import { db } from "@/lib/db";
import { emitLeadEvent } from "@/lib/events";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { leadSelect, serialiseLead } from "../_lib/shapes";

const STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const;
type LeadStatus = (typeof STATUSES)[number];

/**
 * /api/v1/leads
 *
 *   GET  ?page=|?cursor=&status=
 *   POST create
 *
 * The authenticated sibling of POST /api/leads, which is the public,
 * shop-slug-addressed endpoint behind an embeddable quote form. Two endpoints
 * because they are two different trust levels: the public one is rate-limited,
 * honeypotted and write-only; this one holds a key and can read the inbox back.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const statusRaw = queryParam(url, "status")?.toUpperCase();
  if (statusRaw && !STATUSES.includes(statusRaw as LeadStatus)) {
    return apiError("invalid_request", `status must be one of ${STATUSES.join(", ")}.`);
  }

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(statusRaw ? { status: statusRaw as LeadStatus } : {}),
  };

  const [rows, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: leadSelect,
    }),
    db.lead.count({ where }),
  ]);

  return listResponse(rows, serialiseLead, plan, total);
});

const createSchema = z.object({
  name: z.string().trim().min(1, "A name is required").max(120),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(60).optional(),
  message: z.string().max(5000).optional(),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  // Same rule the public form enforces: without an email or a phone number the
  // lead is a dead row nobody can action.
  if (!input.email && !input.phone) {
    return apiError(
      "invalid_request",
      "An email address or a phone number is required.",
    );
  }

  const lead = await db.lead.create({
    data: {
      shopId: auth.shopId,
      name: input.name,
      email: input.email?.toLowerCase() ?? null,
      phone: input.phone ?? null,
      source: input.source ?? "api",
      message: input.message ?? null,
      status: "NEW",
    },
    select: leadSelect,
  });

  await emitLeadEvent(auth.shopId, "lead.created", lead.id);

  return apiItem(serialiseLead(lead), 201);
});
