"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";

import type {
  AppointmentResult,
  SimpleResult,
} from "@/components/appointments/appointment-state";
import {
  asAppointmentStatus,
  parseLocalDateTime,
} from "@/components/appointments/calendar-meta";
import { requireRole, requireUser } from "@/lib/auth";
import { sendEmail, sendSms } from "@/lib/comms";
import { db } from "@/lib/db";
import { emitAppointmentEvent, emitCustomerEvent } from "@/lib/events";

/**
 * Server actions for the Appointments calendar.
 *
 * MULTI-TENANCY: every id that arrives over the wire (appointment, customer,
 * ticket, tech, location) is re-checked against the session's shop before it is
 * written. See the contract in lib/db.ts.
 */

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Radix Select can't hold an empty string, so "none" is the null sentinel. */
const NONE = "none";

function str(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalId(fd: FormData, key: string): string | null {
  const value = str(fd, key);
  return !value || value === NONE ? null : value;
}

function bool(fd: FormData, key: string): boolean {
  const value = str(fd, key);
  return value === "on" || value === "true" || value === "1";
}

function revalidateCalendar() {
  revalidatePath("/appointments");
}

// ---------------------------------------------------------------------------
// Scoped lookups
// ---------------------------------------------------------------------------

async function validCustomerId(shopId: string, id: string | null) {
  if (!id) return null;
  const row = await db.customer.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * A ticket is only accepted when it belongs to this shop AND — when a customer
 * was chosen — to that customer, so a guessed id can't staple another person's
 * repair onto the booking.
 */
async function validTicketId(
  shopId: string,
  customerId: string | null,
  id: string | null,
) {
  if (!id) return null;
  const row = await db.ticket.findFirst({
    where: { id, shopId, ...(customerId ? { customerId } : {}) },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function validUserId(shopId: string, id: string | null) {
  if (!id) return null;
  const row = await db.user.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function validLocationId(shopId: string, id: string | null) {
  if (!id) return null;
  const row = await db.location.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Parsing the form's date + time + duration triple
// ---------------------------------------------------------------------------

type ParsedWhen =
  | { ok: true; startsAt: Date; endsAt: Date }
  | { ok: false; error: string };

function readWhen(fd: FormData): ParsedWhen {
  const startsAt = parseLocalDateTime(`${str(fd, "startDate")}T${str(fd, "startTime")}`);
  if (!startsAt) return { ok: false, error: "Pick a start date and time." };

  const duration = str(fd, "duration") || "60";

  if (duration === "custom") {
    const endTime = str(fd, "endTime");
    const endsAt = parseLocalDateTime(`${str(fd, "startDate")}T${endTime}`);
    if (!endsAt) return { ok: false, error: "Pick an end time." };
    if (endsAt <= startsAt) {
      return { ok: false, error: "The end time has to be after the start time." };
    }
    return { ok: true, startsAt, endsAt };
  }

  const minutes = Number.parseInt(duration, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, error: "Pick how long the appointment runs." };
  }
  return { ok: true, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

/**
 * The first other booking that would put the same tech in two places at once.
 * Canceled appointments don't count — they're history, not commitments.
 *
 * Standard half-open overlap: two intervals collide when each starts before the
 * other ends, so a 10:00–11:00 and an 11:00–12:00 sit flush rather than clash.
 */
async function findConflict(
  shopId: string,
  assignedToId: string | null,
  startsAt: Date,
  endsAt: Date,
  excludeId: string | null,
) {
  if (!assignedToId) return null;

  return db.appointment.findFirst({
    where: {
      shopId,
      assignedToId,
      status: { not: "CANCELED" },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      assignedTo: { select: { name: true } },
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });
}

function conflictPayload(row: NonNullable<Awaited<ReturnType<typeof findConflict>>>) {
  return {
    id: row.id,
    title: row.title,
    when: `${format(row.startsAt, "EEE MMM d, h:mm a")} – ${format(row.endsAt, "h:mm a")}`,
    techName: row.assignedTo?.name ?? "This tech",
    customerName: row.customer
      ? row.customer.businessName ||
        `${row.customer.firstName} ${row.customer.lastName}`.trim()
      : null,
  };
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------

/**
 * Emails the customer that their slot is booked.
 *
 * Fire-and-forget by design: `sendEmail` already refuses to throw for a
 * delivery problem, files exactly one CommunicationLog row (including for an
 * opt-out or a missing address), and this call is wrapped anyway — a mail
 * provider having a bad afternoon must never undo a booking that is already in
 * the diary.
 */
async function sendConfirmation(input: {
  shopId: string;
  customerId: string | null;
  ticketId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  action: "booked" | "updated";
}): Promise<void> {
  if (!input.customerId) return;

  const when = `${format(input.startsAt, "EEEE, MMMM d")} at ${format(input.startsAt, "h:mm a")}`;

  try {
    const result = await sendEmail({
      shopId: input.shopId,
      customerId: input.customerId,
      ticketId: input.ticketId,
      subject:
        input.action === "booked"
          ? `Appointment confirmed — ${input.title}`
          : `Appointment updated — ${input.title}`,
      body: [
        input.action === "booked"
          ? `Your appointment is booked.`
          : `Your appointment has been moved.`,
        "",
        `${input.title}`,
        `${when} (until ${format(input.endsAt, "h:mm a")})`,
        "",
        "If that no longer works, just reply or give us a call.",
      ].join("\n"),
      context: input.title,
    });
    // The text is the one people actually see. `sendSms` does its own checks —
    // no mobile or no consent is recorded as a skip, never sent anyway.
    const text = await sendSms({
      shopId: input.shopId,
      customerId: input.customerId,
      ticketId: input.ticketId,
      body:
        input.action === "booked"
          ? `You're booked: ${input.title}, ${when}. Reply or call us if that changes.`
          : `Your appointment moved: ${input.title}, now ${when}. Reply or call us if that doesn't work.`,
    });
    // Quiet by design — the outbox rows are the record staff actually read.
    console.log(
      `[appointments] confirmation email ${result.status}, text ${text.status}`,
    );
  } catch (error) {
    console.error("[appointments] confirmation failed to send", error);
  }
}

// ---------------------------------------------------------------------------
// Booking someone who is not a customer yet
// ---------------------------------------------------------------------------

type NewCustomer = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  /** The front desk asked, and the customer said yes to texts. */
  smsOptIn: boolean;
};

function readNewCustomer(
  formData: FormData,
): { ok: true; value: NewCustomer } | { ok: false; error: string } | null {
  if (formData.get("customerId") !== "new") return null;
  const name = str(formData, "newCustomerName").slice(0, 120);
  if (!name) return { ok: false, error: "Add the new customer's name." };
  const phone = str(formData, "newCustomerPhone").slice(0, 40) || null;
  // Optional. But a typo'd address is worse than none: the booking confirmation
  // and every reminder after it would go nowhere without anyone noticing.
  const email = str(formData, "newCustomerEmail").slice(0, 200).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email doesn't look right — fix it or leave it blank." };
  }
  const parts = name.split(/\s+/);
  return {
    ok: true,
    value: {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone,
      email,
      // Consent without a number to text is meaningless, so it is only kept
      // when there is one.
      smsOptIn: Boolean(phone) && bool(formData, "newCustomerSmsOk"),
    },
  };
}

/**
 * The same person ringing twice must not become two customers. With a phone
 * number, the last seven digits decide (so "780-555-0142" and "7805550142" are
 * one person) and so does the email; with neither, only an exact name match
 * counts.
 */
async function existingCustomerId(shopId: string, person: NewCustomer): Promise<string | null> {
  const digits = person.phone?.replace(/\D/g, "") ?? "";
  const known: Prisma.CustomerWhereInput[] = [];
  if (digits.length >= 7) {
    known.push({ mobile: { contains: digits.slice(-7) } }, { phone: { contains: digits.slice(-7) } });
  }
  if (person.email) known.push({ email: { equals: person.email, mode: "insensitive" } });

  const match = await db.customer.findFirst({
    where:
      known.length > 0
        ? { shopId, OR: known }
        : {
            shopId,
            firstName: { equals: person.firstName, mode: "insensitive" },
            lastName: { equals: person.lastName, mode: "insensitive" },
          },
    select: { id: true },
  });
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/**
 * One action for both create and edit — `appointmentId` null means create.
 * The two paths validate identically, and splitting them would only duplicate
 * six ownership checks.
 */
export async function saveAppointmentAction(
  appointmentId: string | null,
  formData: FormData,
): Promise<AppointmentResult> {
  const { shopId } = await requireUser();

  const title = str(formData, "title");
  if (!title) return { ok: false, error: "Give the appointment a title." };

  const when = readWhen(formData);
  if (!when.ok) return { ok: false, error: when.error };

  // Verify the row we're editing before spending queries on its new contents.
  if (appointmentId) {
    const owned = await db.appointment.findFirst({
      where: { id: appointmentId, shopId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "Appointment not found." };
  }

  // A first-time caller is booked from this same dialog: the form sends
  // `customerId=new` with a name and, ideally, a phone. Who they are is decided
  // here, but the row is only written further down, AFTER the clash check —
  // otherwise "that tech is booked, pick another time" would leave a customer
  // behind on every retry.
  const newCustomer = readNewCustomer(formData);
  if (newCustomer && !newCustomer.ok) return { ok: false, error: newCustomer.error };

  let customerId = newCustomer
    ? await existingCustomerId(shopId, newCustomer.value)
    : await validCustomerId(shopId, optionalId(formData, "customerId"));
  const [ticketId, assignedToId, locationId] = await Promise.all([
    validTicketId(shopId, customerId, optionalId(formData, "ticketId")),
    validUserId(shopId, optionalId(formData, "assignedToId")),
    validLocationId(shopId, optionalId(formData, "locationId")),
  ]);

  if (!bool(formData, "confirmOverlap")) {
    const clash = await findConflict(
      shopId,
      assignedToId,
      when.startsAt,
      when.endsAt,
      appointmentId,
    );
    if (clash) {
      return {
        ok: false,
        error: "That tech is already booked then.",
        conflict: conflictPayload(clash),
      };
    }
  }

  if (newCustomer && !customerId) {
    const created = await db.customer.create({
      data: {
        shopId,
        firstName: newCustomer.value.firstName,
        lastName: newCustomer.value.lastName,
        mobile: newCustomer.value.phone,
        email: newCustomer.value.email,
        smsOptIn: newCustomer.value.smsOptIn,
      },
      select: { id: true },
    });
    customerId = created.id;
    await emitCustomerEvent(shopId, "customer.created", created.id);
    revalidatePath("/customers");
  }

  const data = {
    title,
    notes: str(formData, "notes") || null,
    startsAt: when.startsAt,
    endsAt: when.endsAt,
    customerId,
    ticketId,
    assignedToId,
    locationId,
  };

  const saved = appointmentId
    ? await db.appointment.update({
        where: { id: appointmentId },
        data,
        select: { id: true },
      })
    : await db.appointment.create({
        data: { ...data, shopId, status: "SCHEDULED" },
        select: { id: true },
      });

  if (!appointmentId) {
    await emitAppointmentEvent(shopId, "appointment.created", saved.id);
  }

  // DB work first, then the message — never the other way round.
  await sendConfirmation({
    shopId,
    customerId,
    ticketId,
    title,
    startsAt: when.startsAt,
    endsAt: when.endsAt,
    action: appointmentId ? "updated" : "booked",
  });

  revalidateCalendar();
  return { ok: true, id: saved.id };
}

// ---------------------------------------------------------------------------
// Status / delete
// ---------------------------------------------------------------------------

export async function setAppointmentStatusAction(
  appointmentId: string,
  status: string,
): Promise<SimpleResult> {
  const { shopId } = await requireUser();
  const next = asAppointmentStatus(status);

  /*
    BRINGING A CANCELED APPOINTMENT BACK IS A BOOKING, SO IT HAS TO CHECK.

    `findConflict` excludes CANCELED rows — which is right, a canceled slot is
    free. But that means the moment one is canceled the slot really is free,
    and somebody can book it. Reinstating without a check (which is exactly
    what "undo" does, seconds later, and what the Reopen button does days
    later) then puts two jobs on one tech at one time, silently.

    Only this direction needs it. Moving TO canceled, or to done, only ever
    releases a slot.
  */
  if (next !== "CANCELED") {
    const current = await db.appointment.findFirst({
      where: { id: appointmentId, shopId },
      select: {
        status: true,
        assignedToId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!current) return { ok: false, error: "Appointment not found." };

    if (current.status === "CANCELED") {
      const clash = await findConflict(
        shopId,
        current.assignedToId,
        current.startsAt,
        current.endsAt,
        appointmentId,
      );
      if (clash) {
        // `SimpleResult` carries a string, not the structured payload the
        // booking dialog renders — so the same facts are said in one line,
        // in the dialog's own words.
        const { techName, title, when } = conflictPayload(clash);
        return {
          ok: false,
          error: `${techName} is already booked — "${title}", ${when}. Move that one, or reassign this.`,
        };
      }
    }
  }

  const updated = await db.appointment.updateMany({
    where: { id: appointmentId, shopId },
    data: { status: next },
  });
  if (updated.count === 0) return { ok: false, error: "Appointment not found." };

  revalidateCalendar();
  return { ok: true };
}

/**
 * OWNER only. Canceling keeps the slot in the history where a no-show belongs;
 * deleting is for the ones booked by mistake, and that's an owner's call.
 */
export async function deleteAppointmentAction(
  appointmentId: string,
): Promise<SimpleResult> {
  const { shopId } = await requireRole("OWNER");

  const deleted = await db.appointment.deleteMany({
    where: { id: appointmentId, shopId },
  });
  if (deleted.count === 0) return { ok: false, error: "Appointment not found." };

  revalidateCalendar();
  return { ok: true };
}
