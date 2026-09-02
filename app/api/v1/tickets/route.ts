import { z } from "zod";

import { db } from "@/lib/db";
import { emitTicketEvent } from "@/lib/events";
import { shopDefaultLocationId } from "@/lib/location";
import { withNextNumber } from "@/lib/sequence";
import { slaDueDate } from "@/lib/sla";
import { withApiKey } from "../_lib/handler";
import { isoDate } from "../_lib/schema";
import { listResponse, planList } from "../_lib/list";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { serialiseTicket, ticketSelect } from "../_lib/shapes";

/**
 * /api/v1/tickets
 *
 *   GET  ?page=|?cursor=&status=&customerId=   list, newest first
 *   POST                                       create
 *
 * `status` is a free-form string in the schema (a shop can define its own
 * workflow), so the filter is an exact match on whatever the shop uses rather
 * than a fixed enum. An unknown status returns an empty page, not an error.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const status = queryParam(url, "status");
  const customerId = queryParam(url, "customerId");

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: ticketSelect,
    }),
    db.ticket.count({ where }),
  ]);

  return listResponse(rows, serialiseTicket, plan, total);
});

const createSchema = z.object({
  customerId: z.string().trim().min(1, "Customer id is required"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  problemType: z.string().trim().min(1, "Problem type is required").max(80),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  status: z.string().trim().max(60).optional(),
  assignedToId: z.string().trim().nullable().optional(),
  dueDate: isoDate.optional(),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  // The customer must be this shop's. A foreign id is reported as not-found,
  // matching GET /customers/{id} — the API never admits that the row exists.
  const customer = await db.customer.findFirst({
    where: { id: input.customerId, shopId: auth.shopId },
    select: { id: true },
  });
  if (!customer) return apiError("not_found", "No customer with that id.");

  // Same rule for the assignee: a user id from another shop is refused rather
  // than silently dropped, because "the ticket was created unassigned" is a
  // surprise an integration should hear about.
  if (input.assignedToId) {
    const user = await db.user.findFirst({
      where: { id: input.assignedToId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!user) return apiError("not_found", "No team member with that id.");
  }

  // An API-created ticket gets the same treatment as one taken at the counter:
  // the shop's default branch, and — when the caller named no date of its own —
  // a due date from the response target for its priority (there is no session
  // here, so no user default to consult).
  const [shop, locationId] = await Promise.all([
    db.shop.findUnique({
      where: { id: auth.shopId },
      select: { settings: true },
    }),
    shopDefaultLocationId(auth.shopId),
  ]);
  const priority = input.priority ?? "NORMAL";

  try {
    // Ticket numbers are per-shop sequential and guarded by a unique index;
    // withNextNumber allocates and retries on the race. Same path the intake
    // screen uses, so an API-created ticket is indistinguishable from one
    // taken at the counter — except for `source`, which says "api".
    const ticket = await withNextNumber(auth.shopId, "ticket", (number) =>
      db.ticket.create({
        data: {
          shopId: auth.shopId,
          customerId: customer.id,
          number,
          locationId,
          subject: input.subject,
          problemType: input.problemType,
          priority,
          status: input.status || "New",
          assignedToId: input.assignedToId ?? null,
          dueDate: input.dueDate
            ? new Date(input.dueDate)
            : slaDueDate(shop?.settings, priority),
          source: "api",
        },
        select: ticketSelect,
      }),
    );

    await emitTicketEvent(auth.shopId, "ticket.created", ticket.id);

    return apiItem(serialiseTicket(ticket), 201);
  } catch {
    return apiError("server_error", "Could not create that ticket.");
  }
});
