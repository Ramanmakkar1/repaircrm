"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { renderEmail, renderSms, sendEmail, sendSms } from "@/lib/comms";
import { estimateMessage } from "@/lib/comms/documents";
import { db } from "@/lib/db";
import { emitEstimateEvent } from "@/lib/events";
import { calcTotals } from "@/lib/money";
import { withNextNumber } from "@/lib/sequence";
import { fromDateInputValue } from "@/components/billing/format";
import {
  describeOutcome,
  type SendChannelOutcome,
  type SendPreviewState,
  type SendRequest,
  type SendResultState,
} from "@/components/billing/send-types";
import {
  formError,
  formSuccess,
  parseLines,
  type FormState,
} from "@/components/billing/types";

/**
 * Estimate mutations.
 *
 * STATUS RULES (enforced here, mirrored in the UI as disabled buttons):
 *   DRAFT                     → SENT       Mark sent (+ CommunicationLog)
 *   DRAFT / SENT / DECLINED   → APPROVED   Approve (stamps approvedAt)
 *   DRAFT / SENT / APPROVED   → DECLINED   Decline
 *   DRAFT / SENT / APPROVED   → CONVERTED  Convert to invoice
 *   CONVERTED                 terminal — an estimate that became an invoice is
 *                             frozen, so the invoice stays the record of what
 *                             was actually agreed.
 *   Lines are editable in every status except CONVERTED.
 */

type Line = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

const APPROVABLE = ["DRAFT", "SENT", "DECLINED"];
const DECLINABLE = ["DRAFT", "SENT", "APPROVED"];
const CONVERTIBLE = ["DRAFT", "SENT", "APPROVED"];

async function resolveCustomer(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  return db.customer.findFirst({ where: { id, shopId } });
}

async function resolveTicketId(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  const ticket = await db.ticket.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  return ticket?.id ?? null;
}

function readNotes(formData: FormData): string | null {
  const notes = String(formData.get("notes") ?? "").trim();
  return notes === "" ? null : notes.slice(0, 5000);
}

function lineCreateData(lines: Line[]) {
  return lines.map((line, index) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxable: line.taxable,
    sortOrder: index,
  }));
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export async function createEstimateAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this estimate.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { taxRateBps: true },
  });

  const ticketId = await resolveTicketId(shopId, formData.get("ticketId"));

  const estimate = await withNextNumber(shopId, "estimate", (number) =>
    db.estimate.create({
      data: {
        shopId,
        customerId: customer.id,
        ticketId,
        number,
        status: "DRAFT",
        taxRateBps: shop?.taxRateBps ?? 0,
        notes: readNotes(formData),
        expiresAt: fromDateInputValue(formData.get("date")),
        lines: { create: lineCreateData(parsed.lines) },
      },
      select: { id: true },
    })
  );

  revalidatePath("/estimates");
  redirect(`/estimates/${estimate.id}`);
}

export async function updateEstimateAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { id: true, status: true },
  });
  if (!estimate) return formError("That estimate no longer exists.");
  if (estimate.status === "CONVERTED") {
    return formError(
      "This estimate has already been converted to an invoice — edit the invoice instead."
    );
  }

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this estimate.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  await db.$transaction([
    db.estimateLine.deleteMany({ where: { estimateId: estimate.id } }),
    db.estimate.update({
      where: { id: estimate.id },
      data: {
        customerId: customer.id,
        notes: readNotes(formData),
        expiresAt: fromDateInputValue(formData.get("date")),
        lines: { create: lineCreateData(parsed.lines) },
      },
    }),
  ]);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
  redirect(`/estimates/${estimate.id}`);
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * One-click "mark sent + email the default message".
 *
 * SUPERSEDED by `sendEstimateAction` (below), which is what the Send dialog
 * calls. Kept as the no-JavaScript fallback, delegating to the same delivery
 * core so the two paths cannot drift apart.
 */
export async function markEstimateSentAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await loadEstimateForSend(shopId, id);
  if (!estimate || estimate.status !== "DRAFT") return;

  const request = { id, subject: "", message: "", email: true, sms: false };
  if (unreachableReason(estimate.customer, request)) return;

  await deliverEstimate(shopId, estimate, request);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
}

// ---------------------------------------------------------------------------
// SENDING — email, SMS, or both, with a preview built from the real templates
// ---------------------------------------------------------------------------

/**
 * Same system as invoices (see app/(app)/invoices/actions.ts for the full
 * reasoning), minus the money: an estimate has nothing owed, so it never
 * carries a pay-online link and never mentions a balance. The call to action is
 * "approve or decline", which is what the customer actually has to do.
 *
 * The approve/decline flow itself is untouched — this only delivers the
 * document and moves DRAFT → SENT.
 */
async function loadEstimateForSend(shopId: string, id: string) {
  return db.estimate.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      expiresAt: true,
      taxRateBps: true,
      publicToken: true,
      customerId: true,
      ticketId: true,
      customer: {
        select: {
          firstName: true,
          email: true,
          mobile: true,
          emailOptIn: true,
          smsOptIn: true,
        },
      },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      shop: { select: { name: true } },
    },
  });
}

type EstimateForSend = NonNullable<
  Awaited<ReturnType<typeof loadEstimateForSend>>
>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Can any requested channel actually reach this customer? Checked before the
 * status moves, for the same reason as invoices: an estimate parked at SENT
 * that nobody received is an approval the shop will wait on forever.
 */
function unreachableReason(
  customer: {
    email: string | null;
    mobile: string | null;
    emailOptIn: boolean;
    smsOptIn: boolean;
  },
  input: SendRequest
): string | null {
  const reasons: string[] = [];

  if (input.email) {
    const address = (input.emailTo ?? "").trim() || customer.email;
    if (!customer.emailOptIn) reasons.push("this customer has opted out of email");
    else if (!address) reasons.push("there is no email address on file");
    else return null;
  }

  if (input.sms) {
    if (!customer.smsOptIn) reasons.push("this customer has opted out of SMS");
    else if (!customer.mobile?.trim()) reasons.push("there is no mobile number on file");
    else return null;
  }

  return `Nothing was sent — ${reasons.join(", and ")}.`;
}

function composeEstimateMessage(
  estimate: EstimateForSend,
  input: SendRequest
) {
  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  return estimateMessage({
    shopName: estimate.shop.name,
    customerFirstName: estimate.customer.firstName,
    number: estimate.number,
    publicToken: estimate.publicToken,
    createdAt: estimate.createdAt,
    expiresAt: estimate.expiresAt,
    lineCount: estimate.lines.length,
    totalCents: totals.totalCents,
    message: input.message,
    subject: input.subject,
  });
}

async function deliverEstimate(
  shopId: string,
  estimate: EstimateForSend,
  input: SendRequest
): Promise<{
  outcomes: SendChannelOutcome[];
  statusChanged: boolean;
  status: string;
}> {
  const message = composeEstimateMessage(estimate, input);

  const outcomes: SendChannelOutcome[] = [];
  const emailTo = (input.emailTo ?? "").trim();

  if (input.email) {
    const result = await sendEmail({
      shopId,
      customerId: estimate.customerId,
      ticketId: estimate.ticketId,
      to: emailTo || undefined,
      subject: message.subject,
      body: message.emailBody,
      summary: message.summary,
      context: message.context,
      portalPath: message.portalPath,
    });
    const to = emailTo || estimate.customer.email || "";
    outcomes.push({
      channel: "EMAIL",
      to,
      status: result.status,
      ...describeOutcome("EMAIL", to, result.status),
    });
  }

  if (input.sms) {
    const result = await sendSms({
      shopId,
      customerId: estimate.customerId,
      ticketId: estimate.ticketId,
      body: message.smsBody,
      portalPath: message.portalPath,
    });
    const to = estimate.customer.mobile ?? "";
    outcomes.push({
      channel: "SMS",
      to,
      status: result.status,
      ...describeOutcome("SMS", to, result.status),
    });
  }

  // Only a delivery that actually went out earns SENT — a send where every
  // channel was skipped or failed leaves a DRAFT honestly a DRAFT. Re-sending
  // an APPROVED estimate must not drag it back to SENT either.
  const anyDelivered = outcomes.some(
    (o) => o.status === "sent" || o.status === "logged",
  );
  let status = estimate.status;
  let statusChanged = false;
  if (estimate.status === "DRAFT" && anyDelivered) {
    await db.estimate.update({
      where: { id: estimate.id },
      data: { status: "SENT" },
    });
    status = "SENT";
    statusChanged = true;
  }

  return { outcomes, statusChanged, status };
}

export async function previewEstimateSendAction(
  input: SendRequest
): Promise<SendPreviewState> {
  const { shopId } = await requireUser();

  const estimate = await loadEstimateForSend(shopId, String(input.id ?? ""));
  if (!estimate) return { ok: false, error: "That estimate no longer exists." };

  const message = composeEstimateMessage(estimate, input);

  const email = renderEmail({
    shopName: estimate.shop.name,
    subject: message.subject,
    body: message.emailBody,
    portalUrl: message.linkUrl,
    context: message.context,
    summary: message.summary,
  });

  return {
    ok: true,
    preview: {
      subject: message.subject,
      emailHtml: email.html,
      emailText: email.text,
      smsText: renderSms({
        shopName: estimate.shop.name,
        body: message.smsBody,
        portalUrl: message.linkUrl,
      }),
      linkUrl: message.linkUrl,
      // An estimate never advertises payment — there is nothing owed yet.
      payOnline: false,
    },
  };
}

export async function sendEstimateAction(
  input: SendRequest
): Promise<SendResultState> {
  const { shopId } = await requireUser();

  if (!input.email && !input.sms) {
    return { ok: false, error: "Pick at least one way to send this." };
  }

  const emailTo = (input.emailTo ?? "").trim();
  if (input.email && emailTo && !EMAIL_SHAPE.test(emailTo)) {
    return { ok: false, error: `"${emailTo}" is not a valid email address.` };
  }

  const estimate = await loadEstimateForSend(shopId, String(input.id ?? ""));
  if (!estimate) return { ok: false, error: "That estimate no longer exists." };
  if (estimate.lines.length === 0) {
    return { ok: false, error: "Add line items before sending this estimate." };
  }

  const unreachable = unreachableReason(estimate.customer, input);
  if (unreachable) return { ok: false, error: unreachable };

  const result = await deliverEstimate(shopId, estimate, input);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
  revalidatePath(`/customers/${estimate.customerId}`);

  return { ok: true, ...result };
}

export async function approveEstimateAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { id: true, status: true },
  });
  if (!estimate || !APPROVABLE.includes(estimate.status)) return;

  await db.estimate.update({
    where: { id: estimate.id },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  await emitEstimateEvent(shopId, "estimate.approved", estimate.id);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
}

/** Approve *and* record the customer's signature, from the signature dialog. */
export async function approveWithSignatureAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const signature = String(formData.get("signature") ?? "");
  if (!signature.startsWith("data:image/png;base64,")) {
    return formError("Capture a signature before saving.");
  }
  if (signature.length > 400_000) {
    return formError("That signature image is too large.");
  }

  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { id: true, status: true },
  });
  if (!estimate) return formError("That estimate no longer exists.");
  if (estimate.status === "CONVERTED") {
    return formError("This estimate has already been converted to an invoice.");
  }

  await db.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvalSignatureDataUrl: signature,
    },
  });

  await emitEstimateEvent(shopId, "estimate.approved", estimate.id);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
  return formSuccess();
}

export async function declineEstimateAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { id: true, status: true },
  });
  if (!estimate || !DECLINABLE.includes(estimate.status)) return;

  await db.estimate.update({
    where: { id: estimate.id },
    data: { status: "DECLINED", approvedAt: null },
  });

  await emitEstimateEvent(shopId, "estimate.declined", estimate.id);

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
}

// ---------------------------------------------------------------------------
// Convert to invoice — the one-click move this module exists for
// ---------------------------------------------------------------------------

export async function convertEstimateAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate || !CONVERTIBLE.includes(estimate.status)) return;
  if (estimate.lines.length === 0) return;

  // The invoice is created first: if numbering or the write fails, the estimate
  // is left untouched and convertible, rather than marked CONVERTED with no
  // invoice to show for it.
  const invoice = await withNextNumber(shopId, "invoice", (number) =>
    db.invoice.create({
      data: {
        shopId,
        customerId: estimate.customerId,
        ticketId: estimate.ticketId,
        estimateId: estimate.id,
        number,
        status: "DRAFT",
        // Carry the estimate's snapshotted rate, not today's shop setting —
        // the customer approved a total computed at that rate.
        taxRateBps: estimate.taxRateBps,
        notes: estimate.notes,
        lines: {
          create: estimate.lines.map((line, index) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            taxable: line.taxable,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    })
  );

  await db.estimate.update({
    where: { id: estimate.id },
    data: { status: "CONVERTED" },
  });

  revalidatePath("/estimates");
  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}
