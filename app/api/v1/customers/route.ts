import { z } from "zod";

import { db } from "@/lib/db";
import { authApiKey, isDenied } from "../_lib/auth";
import {
  apiError,
  apiItem,
  apiList,
  PAGE_SIZE,
  parsePage,
  queryParam,
  readJson,
  skipFor,
  zodError,
} from "../_lib/respond";
import { customerSelect, serialiseCustomer } from "../_lib/shapes";

/**
 * /api/v1/customers
 *
 *   GET  ?page=&q=   list, 50 per page, newest first
 *   POST             create
 *
 * `q` matches first name, last name, business name, email or phone,
 * case-insensitively — the same fields the staff search box covers, so an
 * integration and an employee find the same person.
 */
export async function GET(request: Request) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const url = new URL(request.url);
  const page = parsePage(url);
  const q = queryParam(url, "q");

  const where = {
    shopId: auth.shopId,
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { businessName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: skipFor(page),
      take: PAGE_SIZE,
      select: customerSelect,
    }),
    db.customer.count({ where }),
  ]);

  return apiList(rows.map(serialiseCustomer), { page, total });
}

/**
 * Only the fields an integration genuinely needs to create a person are
 * accepted. Everything else (address, opt-ins, notes, credit) is left at its
 * schema default — a create endpoint that accepts every column is a create
 * endpoint that will eventually accept `creditBalanceCents` from the internet.
 */
const createSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  businessName: z.string().trim().max(120).optional(),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const customer = await db.customer.create({
      // shopId comes from the key, never from the body.
      data: {
        shopId: auth.shopId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        businessName: parsed.data.businessName ?? null,
        email: parsed.data.email?.toLowerCase() ?? null,
        phone: parsed.data.phone ?? null,
      },
      select: customerSelect,
    });

    return apiItem(serialiseCustomer(customer), 201);
  } catch {
    return apiError("server_error", "Could not create that customer.");
  }
}
