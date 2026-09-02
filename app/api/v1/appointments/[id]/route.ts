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
import { appointmentSelect, serialiseAppointment } from "../../_lib/shapes";

/**
 * /api/v1/appointments/{id}
 *
 *   GET     read
 *   PATCH   move it, retitle it, reassign it, or close it out
 *   DELETE  remove it from the diary
 *
 * DELETE really deletes here, unlike an invoice: an appointment is a plan, not
 * a document, and a cancelled plan that has to stay on the calendar forever is
 * clutter. A shop that wants the history sets `status: "CANCELED"` instead.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const appointment = await db.appointment.findFirst({
    where: { id, shopId: auth.shopId },
    select: appointmentSelect,
  });

  if (!appointment) return apiError("not_found", "No appointment with that id.");

  return apiItem(serialiseAppointment(appointment));
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  notes: z.string().max(5000).nullable().optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  status: z.enum(["SCHEDULED", "DONE", "CANCELED"]).optional(),
  assignedToId: z.string().trim().nullable().optional(),
});

export const PATCH = withApiKey<Params>(async (request, auth, { params }) => {
  const { id } = await params;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  if (Object.keys(input).length === 0) {
    return noFieldsError(Object.keys(patchSchema.shape));
  }

  const appointment = await db.appointment.findFirst({
    where: { id, shopId: auth.shopId },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (!appointment) return apiError("not_found", "No appointment with that id.");

  // Moving one end of the window is validated against the OTHER end as it will
  // be after the write, not as it is now — otherwise pushing `startsAt` past a
  // stored `endsAt` would sail through.
  const startsAt = input.startsAt ? new Date(input.startsAt) : appointment.startsAt;
  const endsAt = input.endsAt ? new Date(input.endsAt) : appointment.endsAt;
  if (endsAt <= startsAt) {
    return apiError("invalid_request", "endsAt must be after startsAt.");
  }

  if (input.assignedToId) {
    const user = await db.user.findFirst({
      where: { id: input.assignedToId, shopId: auth.shopId },
      select: { id: true },
    });
    if (!user) return apiError("not_found", "No team member with that id.");
  }

  await db.appointment.update({
    where: { id: appointment.id },
    data: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.assignedToId === undefined
        ? {}
        : { assignedToId: input.assignedToId }),
      startsAt,
      endsAt,
    },
  });

  const updated = await db.appointment.findFirst({
    where: { id: appointment.id, shopId: auth.shopId },
    select: appointmentSelect,
  });
  if (!updated) return apiError("not_found", "No appointment with that id.");

  return apiItem(serialiseAppointment(updated));
});

export const DELETE = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const { count } = await db.appointment.deleteMany({
    where: { id, shopId: auth.shopId },
  });
  if (count === 0) return apiError("not_found", "No appointment with that id.");

  return apiItem({ id, deleted: true });
});
