"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";
import { withNextNumber } from "@/lib/sequence";

/**
 * "Start a new repair request" from the customer portal.
 *
 * The tenant rule is the portal's inverted one (see app/portal/actions.ts): the
 * cookie's `{ customerId, shopId }` pair is the only source of identity, and
 * every id that arrived over the wire — the device — is re-checked against BOTH
 * before it is used.
 *
 * The ticket lands as `source: "portal"` and `status: "New"`, exactly like a
 * walk-in: it is a request, not a booking, and staff triage it the same way.
 */

export type PortalTicketResult =
  | { ok: true; ticketId: string; ticketNumber: number }
  | { ok: false; error: string };

/** Radix Select cannot hold an empty string, so "new" is the sentinel. */
const NEW_DEVICE = "new";

const schema = z.object({
  deviceType: z.string().trim().min(1, "Tell us what the device is.").max(60),
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

export async function createPortalTicketAction(
  formData: FormData,
): Promise<PortalTicketResult> {
  const session = await getPortalSession();
  if (!session) {
    return { ok: false, error: "Your sign-in link has expired. Please request a new one." };
  }

  const assetId = text(formData, "assetId");

  // An existing device is a filter on customerId AND shopId, never a lookup —
  // a guessed id belongs to nobody as far as this query is concerned.
  const existing =
    assetId && assetId !== NEW_DEVICE
      ? await db.asset.findFirst({
          where: {
            id: assetId,
            customerId: session.customerId,
            shopId: session.shopId,
          },
          select: { id: true, type: true, make: true, model: true },
        })
      : null;

  const parsed = schema.safeParse({
    deviceType: existing ? existing.type : text(formData, "deviceType"),
    problemType: text(formData, "problemType"),
    description: text(formData, "description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;

  const deviceLabel = existing
    ? [existing.make, existing.model].filter(Boolean).join(" ") || existing.type
    : input.deviceType;

  const defaultLocation = await db.location.findFirst({
    where: { shopId: session.shopId, isDefault: true },
    select: { id: true },
  });

  const ticket = await withNextNumber(session.shopId, "ticket", (number) =>
    db.$transaction(async (tx) => {
      const asset =
        existing ??
        (await tx.asset.create({
          data: {
            shopId: session.shopId,
            customerId: session.customerId,
            type: input.deviceType,
          },
          select: { id: true },
        }));

      return tx.ticket.create({
        data: {
          shopId: session.shopId,
          number,
          customerId: session.customerId,
          assetId: asset.id,
          locationId: defaultLocation?.id ?? null,
          source: "portal",
          subject: `${deviceLabel} — ${input.problemType}`.slice(0, 200),
          problemType: input.problemType,
          status: "New",
          priority: "NORMAL",
          // The customer just told us something, so the ticket starts its life
          // owing them a reply — same stamp a portal message sets.
          lastInboundAt: new Date(),
          comments: {
            create: {
              shopId: session.shopId,
              // No authorId: nobody on staff wrote this.
              authorId: null,
              body: input.description,
              isPublic: true,
              subject: "Request from the customer portal",
              updateType: "Created",
              channel: "NOTE",
            },
          },
        },
        select: { id: true, number: true },
      });
    }),
  );

  // Both sides of the app: the customer's list, and the shop's board.
  revalidatePath("/portal/home");
  revalidatePath("/tickets");

  return { ok: true, ticketId: ticket.id, ticketNumber: ticket.number };
}
