/**
 * Appointment reminders — "you're booked in tomorrow at 10".
 *
 * A plain server module, like lib/jobs/reviews.ts: not "use server", called by
 * the runner with a shopId.
 *
 * THE WINDOW, AND WHY IT HAS TWO EDGES
 * ------------------------------------
 *   startsAt >= now       a reminder for a slot that has already begun is not
 *                         a reminder, it is a reproach.
 *   startsAt <= now + 24h the shop's promise to the customer.
 *
 * `reminderSentAt` is the claim: it is stamped whether or not the message left
 * the building, so an opted-out customer is not re-attempted every fifteen
 * minutes until their appointment. lib/comms has already filed the outbox row
 * explaining what happened.
 */

import { format, isToday, isTomorrow } from "date-fns";

import { db } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/comms";

const HORIZON_MS = 24 * 60 * 60 * 1000;

/** A morning's worth of bookings; more than any one shop sends in a pass. */
const MAX_PER_RUN = 50;

export type ReminderRunResult = {
  sent: number;
  errors: string[];
};

export async function runDueAppointmentRemindersForShop(
  shopId: string,
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { sent: 0, errors: [] };

  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_MS);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true, phone: true },
  });
  if (!shop) return result;

  const appointments = await db.appointment.findMany({
    where: {
      shopId,
      status: "SCHEDULED",
      startsAt: { gte: now, lte: horizon },
      reminderSentAt: null,
      // A booking with nobody attached (a bench block, a delivery window) has
      // no one to remind.
      customerId: { not: null },
    },
    orderBy: { startsAt: "asc" },
    take: MAX_PER_RUN,
    select: {
      id: true,
      title: true,
      startsAt: true,
      customerId: true,
      ticketId: true,
      customer: {
        select: { firstName: true, mobile: true, smsOptIn: true },
      },
      location: { select: { name: true } },
    },
  });

  for (const appointment of appointments) {
    const customerId = appointment.customerId;
    const customer = appointment.customer;
    if (!customerId || !customer) continue;

    const when = formatWhen(appointment.startsAt);
    const body = [
      `Hi ${customer.firstName}, a reminder about your appointment with ${shop.name}:`,
      `${appointment.title} — ${when}${appointment.location ? ` at ${appointment.location.name}` : ""}.`,
      shop.phone
        ? `If you need to move it, give us a call on ${shop.phone}.`
        : "Let us know if you need to move it.",
    ].join("\n\n");

    try {
      const useSms = customer.smsOptIn && Boolean(customer.mobile);

      const outcome = useSms
        ? await sendSms({
            shopId,
            customerId,
            ticketId: appointment.ticketId,
            // One line, because it is a text: the paragraphs above are an email.
            body: `Reminder: ${appointment.title} — ${when} at ${shop.name}.`,
          })
        : await sendEmail({
            shopId,
            customerId,
            ticketId: appointment.ticketId,
            subject: `Reminder: ${appointment.title}`,
            body,
            context: `${when} · ${shop.name}`,
          });

      await db.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });

      if (outcome.ok) result.sent += 1;
    } catch (error) {
      result.errors.push(
        `${appointment.title}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

/**
 * "Tomorrow at 10:00 AM" / "Wed, Sep 3 at 10:00 AM".
 *
 * Formatted on the SERVER against the server's own zone, which is the shop's
 * working assumption everywhere else in the app (see the date handling in the
 * ticket actions). A per-shop timezone conversion belongs with the rest of the
 * app's date rendering, not bolted on here.
 */
function formatWhen(startsAt: Date): string {
  const time = startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // date-fns handles the month/year rollovers a hand-rolled `getDate() + 1`
  // gets wrong on the 31st.
  if (isToday(startsAt)) return `today at ${time}`;
  if (isTomorrow(startsAt)) return `tomorrow at ${time}`;

  return `${format(startsAt, "EEE, MMM d")} at ${time}`;
}
