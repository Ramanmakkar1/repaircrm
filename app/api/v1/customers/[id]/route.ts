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
import { customerSelect, serialiseCustomer } from "../../_lib/shapes";

/**
 * /api/v1/customers/{id}
 *
 *   GET     read
 *   PATCH   update the fields you send, leave the rest alone
 *   DELETE  remove — same rule as the owner's Delete button in the UI
 *
 * Every handler scopes by `{ id, shopId }` — never `findUnique` on the id
 * alone. An id belonging to another shop must be indistinguishable from an id
 * that does not exist: 404, not 403. A 403 would confirm the row is real and
 * turn the endpoint into an existence oracle.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, shopId: auth.shopId },
    select: customerSelect,
  });

  if (!customer) return apiError("not_found", "No customer with that id.");

  return apiItem(serialiseCustomer(customer));
});

/**
 * Every field is optional, and `null` clears it — which is why the schema uses
 * `.nullable()` rather than just `.optional()`. Without that distinction there
 * would be no way to remove a phone number through the API, only to overwrite
 * it with a different one.
 *
 * `creditBalanceCents` is deliberately absent. Store credit moves through
 * credit adjustments, which keep an audit trail; letting an integration assign
 * a balance directly would be a way to write money into the shop with no record
 * of where it came from.
 */
const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  businessName: z.string().trim().max(120).nullable().optional(),
  email: z.email("Enter a valid email address").max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  mobile: z.string().trim().max(40).nullable().optional(),
  address1: z.string().trim().max(160).nullable().optional(),
  address2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().length(2).optional(),
  smsOptIn: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
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
  if (typeof data.country === "string") data.country = data.country.toUpperCase();

  // updateMany doubles as the ownership check: a foreign id matches 0 rows and
  // nothing is written.
  const result = await db.customer.updateMany({
    where: { id, shopId: auth.shopId },
    data,
  });
  if (result.count === 0) return apiError("not_found", "No customer with that id.");

  const customer = await db.customer.findFirst({
    where: { id, shopId: auth.shopId },
    select: customerSelect,
  });
  if (!customer) return apiError("not_found", "No customer with that id.");

  return apiItem(serialiseCustomer(customer));
});

/**
 * DELETE — the same rule the OWNER's button follows: a customer with tickets,
 * invoices or estimates cannot be deleted, because deleting them would take a
 * repair history and a receivable with them. Clear the documents first, or
 * leave the record alone.
 *
 * Contacts, assets, attachments, comms and portal tokens cascade from Customer,
 * so a deletable customer leaves nothing orphaned behind.
 */
export const DELETE = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, shopId: auth.shopId },
    select: {
      id: true,
      _count: { select: { tickets: true, invoices: true, estimates: true } },
    },
  });
  if (!customer) return apiError("not_found", "No customer with that id.");

  const blocking = Object.entries(customer._count)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${count} ${name}`);

  if (blocking.length > 0) {
    return apiError(
      "invalid_request",
      `This customer still has ${blocking.join(", ")}. Delete those first.`,
    );
  }

  await db.customer.delete({ where: { id: customer.id } });

  return apiItem({ id: customer.id, deleted: true });
});
