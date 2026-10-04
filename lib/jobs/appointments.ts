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

import { db } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/comms";
import { dayWords, safeTimeZone, timeIn } from "@/lib/dashboard/logic";

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
    select: { name: true, phone: true, timezone: true },
  });
  if (!shop) return result;
  const zone = safeTimeZone(shop.timezone);

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

    const when = formatWhen(appointment.startsAt, now, zone);
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
 * "tomorrow at 10:00 AM" / "Wed, Sep 3 at 10:00 AM", on the SHOP'S clock
 * (Shop.timezone): the server runs in UTC, and a reminder that told an
 * Edmonton customer "4:00 PM" for a 10 AM visit would be worse than none.
 * Today and tomorrow are the shop's calendar days.
 */
export function formatWhen(startsAt: Date, now: Date, zone: string): string {
  const time = timeIn(startsAt.getTime(), zone);
  const day = dayWords(startsAt.getTime(), now.getTime(), zone);
  if (day === "Today") return `today at ${time}`;
  if (day === "Tomorrow") return `tomorrow at ${time}`;
  return `${day} at ${time}`;
}
