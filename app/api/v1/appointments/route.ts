import { z } from "zod";

import { db } from "@/lib/db";
import { emitAppointmentEvent } from "@/lib/events";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { isoDate } from "../_lib/schema";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { appointmentSelect, serialiseAppointment } from "../_lib/shapes";

const STATUSES = ["SCHEDULED", "DONE", "CANCELED"] as const;
type AppointmentStatus = (typeof STATUSES)[number];

/**
 * /api/v1/appointments
 *
 *   GET  ?page=|?cursor=&status=&from=&to=&customerId=
 *   POST create
 *
 * `from`/`to` filter on `startsAt`, which is what a calendar sync asks for
 * ("what is on next week"). The ORDER is still newest-created-first like every
 * other collection, so a cursor keeps meaning the same thing — a client wanting
 * diary order sorts the window it fetched.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const statusRaw = queryParam(url, "status")?.toUpperCase();
  const from = queryParam(url, "from");
  const to = queryParam(url, "to");
  const customerId = queryParam(url, "customerId");

  if (statusRaw && !STATUSES.includes(statusRaw as AppointmentStatus)) {
    return apiError("invalid_request", `status must be one of ${STATUSES.join(", ")}.`);
  }
  for (const [name, value] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (value && Number.isNaN(Date.parse(value))) {
      return apiError("invalid_request", `${name} must be an ISO 8601 date or date-time.`);
    }
  }

  const window =
    from || to
      ? {
          startsAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...window,
    ...(statusRaw ? { status: statusRaw as AppointmentStatus } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: appointmentSelect,
    }),
    db.appointment.count({ where }),
  ]);

  return listResponse(rows, serialiseAppointment, plan, total);
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the appointment a title").max(160),
  startsAt: isoDate,
  endsAt: isoDate,
  notes: z.string().max(5000).optional(),
  customerId: z.string().trim().optional(),
  ticketId: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
});

/**
 * NO CONFLICT CHECK, deliberately, and it is not an oversight.
 *
 * The booking screen refuses a double-booked tech unless the operator confirms
 * — because a human is standing there and can decide. An API has nobody to ask,
 * and an integration syncing a calendar in one direction would be blocked by a
 * clash it cannot resolve. So the API books what it is told; the clash shows up
 * on the calendar, where somebody can actually deal with it.
 */
export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    return apiError("invalid_request", "endsAt must be after startsAt.");
  }

  // Every optional link is verified against this shop before it is stored, so a
  // guessed id cannot staple another tenant's ticket onto a booking.
  if (input.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!customer) return apiError("not_found", "No customer with that id.");
  }
  if (input.ticketId) {
    const ticket = await db.ticket.findFirst({
      where: { id: input.ticketId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!ticket) return apiError("not_found", "No ticket with that id.");
  }
  if (input.assignedToId) {
    const user = await db.user.findFirst({
      where: { id: input.assignedToId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!user) return apiError("not_found", "No team member with that id.");
  }

  const appointment = await db.appointment.create({
    data: {
      shopId: auth.shopId,
      title: input.title,
      notes: input.notes ?? null,
      startsAt,
      endsAt,
      status: "SCHEDULED",
      customerId: input.customerId ?? null,
      ticketId: input.ticketId ?? null,
      assignedToId: input.assignedToId ?? null,
    },
    select: appointmentSelect,
  });

  await emitAppointmentEvent(auth.shopId, "appointment.created", appointment.id);

  return apiItem(serialiseAppointment(appointment), 201);
});
