import { z } from "zod";

import { db } from "@/lib/db";
import { withApiKey } from "../../_lib/handler";
import {
  apiError,
  apiItem,
  noFieldsError,
  readJson,
  zodError,
} from "../../_lib/respond";
import { leadSelect, serialiseLead } from "../../_lib/shapes";

/**
 * /api/v1/leads/{id}
 *
 *   GET    read
 *   PATCH  update the details, or move the status along
 *
 * `status: "CONVERTED"` is NOT accepted. Converting a lead creates or links a
 * customer and optionally a ticket (see the leads inbox action); setting the
 * flag alone would leave a lead claiming a conversion with nothing to show for
 * it. NEW / CONTACTED / CLOSED are just where the lead sits, and those move
 * freely.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const lead = await db.lead.findFirst({
    where: { id, shopId: auth.shopId },
    select: leadSelect,
  });

  if (!lead) return apiError("not_found", "No lead with that id.");

  return apiItem(serialiseLead(lead));
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email("Enter a valid email address").max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  source: z.string().trim().max(60).nullable().optional(),
  message: z.string().max(5000).nullable().optional(),
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]).optional(),
});

export const PATCH = withApiKey<Params>(async (request, auth, { params }) => {
  const { id } = await params;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);

  const data = { ...parsed.data };
  if (Object.keys(data).length === 0) {
    return noFieldsError(Object.keys(patchSchema.shape));
  }
  if (typeof data.email === "string") data.email = data.email.toLowerCase();

  const lead = await db.lead.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, status: true },
  });
  if (!lead) return apiError("not_found", "No lead with that id.");

  if (data.status && lead.status === "CONVERTED") {
    return apiError(
      "invalid_request",
      "This lead has already been converted to a customer.",
    );
  }

  await db.lead.update({ where: { id: lead.id }, data });

  const updated = await db.lead.findFirst({
    where: { id: lead.id, shopId: auth.shopId },
    select: leadSelect,
  });
  if (!updated) return apiError("not_found", "No lead with that id.");

  return apiItem(serialiseLead(updated));
});

/** A lead is a note about somebody who enquired; deleting one loses nothing. */
export const DELETE = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const { count } = await db.lead.deleteMany({
    where: { id, shopId: auth.shopId },
  });
  if (count === 0) return apiError("not_found", "No lead with that id.");

  return apiItem({ id, deleted: true });
});
