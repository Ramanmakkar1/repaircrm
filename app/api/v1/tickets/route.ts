import { z } from "zod";

import { db } from "@/lib/db";
import { shopDefaultLocationId } from "@/lib/location";
import { withNextNumber } from "@/lib/sequence";
import { slaDueDate } from "@/lib/sla";
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
import { serialiseTicket, ticketSelect } from "../_lib/shapes";

/**
 * /api/v1/tickets
 *
 *   GET  ?page=&status=   list, newest first
 *   POST                  create
 *
 * `status` is a free-form string in the schema (a shop can define its own
 * workflow), so the filter is an exact match on whatever the shop uses rather
 * than a fixed enum. An unknown status returns an empty page, not an error.
 */
export async function GET(request: Request) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const url = new URL(request.url);
  const page = parsePage(url);
  const status = queryParam(url, "status");

  const where = { shopId: auth.shopId, ...(status ? { status } : {}) };

  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: skipFor(page),
      take: PAGE_SIZE,
      select: ticketSelect,
    }),
    db.ticket.count({ where }),
  ]);

  return apiList(rows.map(serialiseTicket), { page, total });
}

const createSchema = z.object({
  customerId: z.string().trim().min(1, "Customer id is required"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  problemType: z.string().trim().min(1, "Problem type is required").max(80),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function POST(request: Request) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);

  // The customer must be this shop's. A foreign id is reported as not-found,
  // matching GET /customers/{id} — the API never admits that the row exists.
  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId, shopId: auth.shopId },
    select: { id: true },
  });
  if (!customer) return apiError("not_found", "No customer with that id.");

  // An API-created ticket gets the same treatment as one taken at the counter:
  // the shop's default branch, and a due date from the response target for its
  // priority (there is no session here, so no user default to consult).
  const [shop, locationId] = await Promise.all([
    db.shop.findUnique({
      where: { id: auth.shopId },
      select: { settings: true },
    }),
    shopDefaultLocationId(auth.shopId),
  ]);
  const priority = parsed.data.priority ?? "NORMAL";

  try {
    // Ticket numbers are per-shop sequential and guarded by a unique index;
    // withNextNumber allocates and retries on the race. Same path the intake
    // screen uses, so an API-created ticket is indistinguishable from one
    // taken at the counter.
    const ticket = await withNextNumber(auth.shopId, "ticket", (number) =>
      db.ticket.create({
        data: {
          shopId: auth.shopId,
          customerId: customer.id,
          number,
          locationId,
          subject: parsed.data.subject,
          problemType: parsed.data.problemType,
          priority,
          dueDate: slaDueDate(shop?.settings, priority),
        },
        select: ticketSelect,
      }),
    );

    return apiItem(serialiseTicket(ticket), 201);
  } catch {
    return apiError("server_error", "Could not create that ticket.");
  }
}
