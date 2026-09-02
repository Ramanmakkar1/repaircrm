import { z } from "zod";

import { db } from "@/lib/db";
import { withApiKey } from "../../_lib/handler";
import { isoDate } from "../../_lib/schema";
import {
  apiError,
  apiItem,
  noFieldsError,
  readJson,
  zodError,
} from "../../_lib/respond";
import { estimateSelect, serialiseEstimate } from "../../_lib/shapes";

/**
 * /api/v1/estimates/{id}
 *
 *   GET    the estimate, its lines and its totals
 *   PATCH  notes, expiry, and DRAFT -> SENT
 *
 * `status` accepts SENT only. APPROVED and DECLINED are the customer's answer,
 * recorded by the portal or by staff with the customer in front of them —
 * an integration marking its own quote approved would be the shop signing on
 * the customer's behalf. CONVERTED is set by the convert-to-invoice flow, which
 * has an invoice to create.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const estimate = await db.estimate.findFirst({
    where: { id, shopId: auth.shopId },
    select: estimateSelect,
  });

  if (!estimate) return apiError("not_found", "No estimate with that id.");

  return apiItem(serialiseEstimate(estimate));
});

const patchSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  expiresAt: isoDate.nullable().optional(),
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
    return noFieldsError(["notes", "expiresAt", 'status ("SENT")']);
  }

  const estimate = await db.estimate.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, status: true },
  });
  if (!estimate) return apiError("not_found", "No estimate with that id.");

  if (estimate.status === "CONVERTED") {
    return apiError(
      "invalid_request",
      "This estimate has already been converted to an invoice.",
    );
  }
  if (input.status === "SENT" && estimate.status !== "DRAFT") {
    return apiError(
      "invalid_request",
      `Only a draft can be marked sent — this one is ${estimate.status}.`,
    );
  }

  await db.estimate.update({
    where: { id: estimate.id },
    data: {
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.expiresAt === undefined
        ? {}
        : { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt) }),
      ...(input.status === undefined ? {} : { status: input.status }),
    },
  });

  const updated = await db.estimate.findFirst({
    where: { id: estimate.id, shopId: auth.shopId },
    select: estimateSelect,
  });
  if (!updated) return apiError("not_found", "No estimate with that id.");

  return apiItem(serialiseEstimate(updated));
});
