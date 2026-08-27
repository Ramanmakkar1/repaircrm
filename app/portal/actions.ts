"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logInbound, portalUrl, sendEmail } from "@/lib/comms";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import {
  getPortalSession,
  issuePortalToken,
  safeNextPath,
} from "@/lib/portal-session";
import { formError, formSuccess, type FormState } from "@/components/billing/types";

/**
 * Portal server actions.
 *
 * TENANT RULE, INVERTED
 * ---------------------
 * The rest of the app scopes every query by the *staff* session's shopId. Here
 * the portal cookie's `{ customerId, shopId }` pair plays that role, and every
 * query below filters on BOTH — an id that arrived over the wire is only ever a
 * filter, never a fact.
 *
 * `requestPortalLink` is the single deliberate exception: it looks a customer up
 * by email across every shop, because that is the only thing a signed-out person
 * can tell us about themselves. It leaks nothing, because it always answers the
 * same way.
 */

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

// ---------------------------------------------------------------------------
// Sign-in link
// ---------------------------------------------------------------------------

/**
 * Emails a 24h magic link to every customer record carrying this address.
 *
 * One person can be a customer of more than one shop on this install, and each
 * of those records is a separate portal identity — so each gets its own link,
 * and the customer picks which shop they meant by which link they open.
 *
 * The response NEVER varies: a match, no match, an opted-out record and a
 * customer with no email all end at the same confirmation screen. Anything else
 * turns this form into an account-enumeration oracle.
 */
export async function requestPortalLinkAction(
  formData: FormData,
): Promise<void> {
  const parsed = emailField.safeParse(formData.get("email"));
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const done = `/portal?sent=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  if (!parsed.success) {
    redirect(`/portal?error=email${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const email = parsed.data;

  const customers = await db.customer.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, shopId: true, firstName: true },
  });

  for (const customer of customers) {
    const token = await issuePortalToken(customer.id);
    const linkPath = `/portal?token=${encodeURIComponent(token)}${
      next ? `&next=${encodeURIComponent(next)}` : ""
    }`;

    await sendEmail({
      shopId: customer.shopId,
      customerId: customer.id,
      to: email,
      subject: "Your sign-in link",
      body: [
        `Hi ${customer.firstName},`,
        "Here is your secure link to your repair portal. It works for the next 24 hours and does not need a password:",
        portalUrl(linkPath),
        "If you didn't ask for this, you can ignore this email — nothing has changed on your account.",
      ].join("\n\n"),
      context: "Sign in to your portal",
      portalPath: linkPath,
    });
  }

  // redirect() throws to unwind — it must stay outside any try/catch.
  redirect(done);
}

// ---------------------------------------------------------------------------
// Estimate approve / decline
// ---------------------------------------------------------------------------

/** A signature is a PNG data URL from the pad, or nothing at all. */
const SIGNATURE_PREFIX = "data:image/png;base64,";
const SIGNATURE_MAX_CHARS = 400_000; // ~300KB decoded — a pad drawing is far less.

function readSignature(formData: FormData): string | null {
  const raw = String(formData.get("signature") ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith(SIGNATURE_PREFIX)) return null;
  if (raw.length > SIGNATURE_MAX_CHARS) return null;
  return raw;
}

/**
 * The customer's answer to an estimate.
 *
 * Only a SENT estimate can be answered from the portal — a DRAFT was never
 * shown to them, and APPROVED/DECLINED/CONVERTED are decisions that have already
 * moved work (or money) and must not be silently flipped from a stale tab.
 *
 * Three things happen together, because staff need all three: the estimate
 * changes state, the answer lands in the customer's communication log (as an
 * inbound message, so it reads as something the customer did), and the linked
 * ticket gets a PUBLIC comment so the timeline tells the whole story.
 */
export async function respondToEstimateAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getPortalSession();
  if (!session) return formError("Your sign-in link has expired. Please request a new one.");

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "approve" && decision !== "decline") {
    return formError("Choose approve or decline.");
  }

  const estimate = await db.estimate.findFirst({
    where: {
      id,
      customerId: session.customerId,
      shopId: session.shopId,
      status: "SENT",
    },
    select: {
      id: true,
      number: true,
      ticketId: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
    },
  });
  if (!estimate) {
    return formError(
      "This estimate can no longer be answered here — please contact the shop.",
    );
  }

  const approved = decision === "approve";
  const signature = approved ? readSignature(formData) : null;
  const total = calcTotals(estimate.lines, estimate.taxRateBps).totalCents;

  await db.estimate.update({
    where: { id: estimate.id },
    data: approved
      ? {
          status: "APPROVED",
          approvedAt: new Date(),
          // Only overwrite when the customer actually signed — an approval
          // without a signature must not wipe one captured at the counter.
          ...(signature ? { approvalSignatureDataUrl: signature } : {}),
        }
      : { status: "DECLINED" },
  });

  const verb = approved ? "approved" : "declined";
  const summary = `Customer ${verb} estimate #${estimate.number} (${formatCents(total)}) via the customer portal.`;

  await logInbound({
    shopId: session.shopId,
    customerId: session.customerId,
    ticketId: estimate.ticketId,
    subject: `Estimate #${estimate.number} ${verb}`,
    body: signature ? `${summary} Signed on screen.` : summary,
    status: "portal",
  });

  if (estimate.ticketId) {
    await db.ticketComment.create({
      data: {
        shopId: session.shopId,
        ticketId: estimate.ticketId,
        // No authorId: this was not written by a member of staff.
        authorId: null,
        body: summary,
        isPublic: true,
        subject: `Estimate #${estimate.number} ${verb}`,
        updateType: approved ? "Approved" : "Declined",
        channel: "NOTE",
      },
    });
  }

  // Both sides of the app need to see this immediately.
  revalidatePath("/portal/home");
  revalidatePath(`/portal/estimates/${estimate.id}`);
  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
  if (estimate.ticketId) {
    revalidatePath("/tickets");
    revalidatePath(`/tickets/${estimate.ticketId}`);
    revalidatePath(`/portal/tickets/${estimate.ticketId}`);
  }

  return formSuccess();
}
