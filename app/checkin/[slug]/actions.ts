"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { portalUrl, sendEmail, sendSms } from "@/lib/comms";
import { withNextNumber } from "@/lib/sequence";
import { readCheckinSettings } from "@/components/settings/checkin-meta";

/**
 * The public check-in form's one write.
 *
 * PUBLIC, LIKE app/api/leads — and it follows the same rules
 * ---------------------------------------------------------
 *   · The tenant is named by SLUG, never by a shopId over the wire, and the
 *     slug is re-resolved here rather than trusted from the page render.
 *   · The form only exists while `settings.checkin.enabled` is true; this
 *     action re-checks that, so a stale tab left open after a shop switched
 *     check-in off cannot keep writing tickets.
 *   · A honeypot field (`website`) answers success and writes nothing. Bots
 *     fill every input they can see; a customer never sees this one.
 *   · Rate-limit-lite: 20 check-ins per shop per hour, counted straight off the
 *     Ticket table. Not a real limiter — it turns "a bot creates 40,000
 *     tickets" into "a bot creates 20 an hour", which is the difference that
 *     matters at this size.
 *
 * Customer, device and ticket are written in ONE transaction: a half-checked-in
 * walk-in (a customer row with no ticket) is worse than a failed submit, because
 * nobody is looking for it.
 */

export type CheckinResult =
  | { ok: true; ticketNumber: number }
  | { ok: false; error: string };

const MAX_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

/** Same shape and cap as the estimate pad in components/billing/signature-dialog. */
const SIGNATURE_PREFIX = "data:image/png;base64,";
const SIGNATURE_MAX_CHARS = 400_000;

const schema = z.object({
  name: z.string().trim().min(2, "Please give us your name.").max(120),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  deviceType: z.string().trim().min(1, "What kind of device is it?").max(60),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  serial: z.string().trim().max(80).optional(),
  unlockCode: z.string().trim().max(60).optional(),
  problemType: z.string().trim().min(1, "Pick what sort of job this is.").max(60),
  description: z
    .string()
    .trim()
    .min(5, "Tell us a little about what's wrong.")
    .max(4000),
});

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Splits "Ada Lovelace" into a first/last pair; a single word gets a blank last. */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export async function submitCheckinAction(
  slug: string,
  formData: FormData,
): Promise<CheckinResult> {
  // Caught bot: look successful, write nothing. Checked before the shop lookup
  // so a spam run cannot use the response to probe which slugs exist.
  if (text(formData, "website") !== "") return { ok: true, ticketNumber: 0 };

  const shop = await db.shop.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, name: true, settings: true },
  });
  if (!shop) return { ok: false, error: "This check-in link is no longer active." };

  const checkin = readCheckinSettings(shop.settings);
  if (!checkin.enabled) {
    return { ok: false, error: "This shop has turned off online check-in." };
  }

  const parsed = schema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    deviceType: text(formData, "deviceType"),
    make: text(formData, "make"),
    model: text(formData, "model"),
    serial: text(formData, "serial"),
    unlockCode: text(formData, "unlockCode"),
    problemType: text(formData, "problemType"),
    description: text(formData, "description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;

  const email = input.email ? input.email.toLowerCase() : "";
  const phone = input.phone ?? "";

  // Without one of these there is no way to tell the customer their device is
  // ready, which is the entire point of checking in.
  if (!email && !phone) {
    return { ok: false, error: "An email address or a phone number is required." };
  }
  if (text(formData, "terms") !== "on") {
    return { ok: false, error: "Please accept the terms before checking in." };
  }

  const signature = readSignature(formData);
  if (!signature) return { ok: false, error: "Please sign in the box above." };

  const recent = await db.ticket.count({
    where: {
      shopId: shop.id,
      source: "checkin",
      createdAt: { gte: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= MAX_PER_HOUR) {
    return {
      ok: false,
      error: "We've had a lot of check-ins in the last hour. Please see the front desk.",
    };
  }

  const { firstName, lastName } = splitName(input.name);
  const subject = `${[input.make, input.model].filter(Boolean).join(" ") || input.deviceType} — ${input.problemType}`;

  const [defaultLocation, existingCustomer] = await Promise.all([
    db.location.findFirst({
      where: { shopId: shop.id, isDefault: true },
      select: { id: true },
    }),
    // Email first, phone second: an address is the stronger identifier, and a
    // shared household phone would otherwise merge two people into one record.
    // Both lookups are scoped to THIS shop — a customer of another tenant with
    // the same address is a different person as far as this shop is concerned.
    findCustomer(shop.id, email, phone),
  ]);

  const created = await withNextNumber(shop.id, "ticket", (number) =>
    db.$transaction(async (tx) => {
      const customer =
        existingCustomer ??
        (await tx.customer.create({
          data: {
            shopId: shop.id,
            firstName,
            lastName,
            email: email || null,
            mobile: phone || null,
            // Checking in is not consent to marketing texts; email is how the
            // ticket confirmation and the pickup notice go out by default.
            emailOptIn: true,
            smsOptIn: false,
          },
          select: { id: true },
        }));

      const asset = await tx.asset.create({
        data: {
          shopId: shop.id,
          customerId: customer.id,
          type: input.deviceType,
          make: input.make || null,
          model: input.model || null,
          serial: input.serial || null,
          password: input.unlockCode || null,
        },
        select: { id: true },
      });

      const ticket = await tx.ticket.create({
        data: {
          shopId: shop.id,
          number,
          customerId: customer.id,
          assetId: asset.id,
          locationId: defaultLocation?.id ?? null,
          source: "checkin",
          subject: subject.slice(0, 200),
          problemType: input.problemType,
          status: "New",
          priority: "NORMAL",
          diagnosticNotes: null,
          intakeSignatureDataUrl: signature,
          intakeSignedAt: new Date(),
          comments: {
            create: {
              shopId: shop.id,
              // No authorId — nobody on staff wrote this; the customer did.
              authorId: null,
              body: input.description,
              isPublic: true,
              subject: "Checked in at the counter",
              updateType: "Created",
              channel: "NOTE",
            },
          },
        },
        select: { id: true, number: true, customerId: true },
      });

      return ticket;
    }),
  );

  // Sending happens AFTER the transaction commits, never inside it: a mail
  // provider timing out must not undo a device that is physically on the bench.
  const portalPath = `/portal/tickets/${created.id}`;
  const body = [
    `Hi ${firstName}, thanks for dropping in.`,
    `We've booked your ${input.deviceType} in as ticket #${created.number}. You can follow it here:`,
    portalUrl(portalPath),
  ].join("\n\n");

  await sendEmail({
    shopId: shop.id,
    customerId: created.customerId,
    ticketId: created.id,
    subject: `Checked in — ticket #${created.number}`,
    body,
    context: `Ticket #${created.number} · ${shop.name}`,
    portalPath,
  });

  await sendSms({
    shopId: shop.id,
    customerId: created.customerId,
    ticketId: created.id,
    body: `Checked in at ${shop.name} — ticket #${created.number}.`,
    portalPath,
  });

  return { ok: true, ticketNumber: created.number };
}

async function findCustomer(shopId: string, email: string, phone: string) {
  if (email) {
    const byEmail = await db.customer.findFirst({
      where: { shopId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  if (phone) {
    return db.customer.findFirst({
      where: { shopId, OR: [{ mobile: phone }, { phone }] },
      select: { id: true },
    });
  }
  return null;
}

function readSignature(formData: FormData): string | null {
  const raw = String(formData.get("signature") ?? "").trim();
  if (!raw.startsWith(SIGNATURE_PREFIX)) return null;
  if (raw.length > SIGNATURE_MAX_CHARS) return null;
  return raw;
}
