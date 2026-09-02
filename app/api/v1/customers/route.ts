import { z } from "zod";

import { db } from "@/lib/db";
import { emitCustomerEvent } from "@/lib/events";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { customerSelect, serialiseCustomer } from "../_lib/shapes";

/**
 * /api/v1/customers
 *
 *   GET  ?page=|?cursor=&q=   list, 50 per page, newest first
 *   POST                      create
 *
 * `q` matches first name, last name, business name, email or phone,
 * case-insensitively — the same fields the staff search box covers, so an
 * integration and an employee find the same person.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const q = queryParam(url, "q");

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(q
      ? {
          AND: [
            {
              OR: [
                { firstName: { contains: q, mode: "insensitive" as const } },
                { lastName: { contains: q, mode: "insensitive" as const } },
                { businessName: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
              ],
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: customerSelect,
    }),
    db.customer.count({ where }),
  ]);

  return listResponse(rows, serialiseCustomer, plan, total);
});

/**
 * Only the fields an integration genuinely needs to create a person are
 * accepted. Everything else (notes, credit) is left at its schema default — a
 * create endpoint that accepts every column is a create endpoint that will
 * eventually accept `creditBalanceCents` from the internet.
 */
const createSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  businessName: z.string().trim().max(120).optional(),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  address1: z.string().trim().max(160).optional(),
  address2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(2).optional(),
  smsOptIn: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  try {
    const customer = await db.customer.create({
      // shopId comes from the key, never from the body.
      data: {
        shopId: auth.shopId,
        firstName: input.firstName,
        lastName: input.lastName,
        businessName: input.businessName ?? null,
        email: input.email?.toLowerCase() ?? null,
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        address1: input.address1 ?? null,
        address2: input.address2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        ...(input.country ? { country: input.country.toUpperCase() } : {}),
        ...(input.smsOptIn === undefined ? {} : { smsOptIn: input.smsOptIn }),
        ...(input.emailOptIn === undefined ? {} : { emailOptIn: input.emailOptIn }),
      },
      select: customerSelect,
    });

    await emitCustomerEvent(auth.shopId, "customer.created", customer.id);

    return apiItem(serialiseCustomer(customer), 201);
  } catch {
    return apiError("server_error", "Could not create that customer.");
  }
});
