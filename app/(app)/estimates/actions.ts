"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/comms";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { withNextNumber } from "@/lib/sequence";
import { formatDate, fromDateInputValue } from "@/components/billing/format";
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

export async function markEstimateSentAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const estimate = await db.estimate.findFirst({
    where: { id, shopId, status: "DRAFT" },
    include: { customer: true, lines: true },
  });
  if (!estimate) return;

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });
  const shopName = shop?.name ?? "your repair shop";

  await db.estimate.update({
    where: { id: estimate.id },
    data: { status: "SENT" },
  });

  // Status first, delivery second — lib/comms owns the single outbox row and
  // never throws, so a provider outage cannot un-send an estimate.
  await sendEmail({
    shopId,
    customerId: estimate.customerId,
    ticketId: estimate.ticketId,
    subject: `Estimate #${estimate.number} from ${shopName}`,
    body: [
      `Hi ${estimate.customer.firstName},`,
      `Here is your estimate for the work we discussed.`,
      `Estimate total: ${formatCents(totals.totalCents)}`,
      estimate.expiresAt
        ? `This estimate is valid until ${formatDate(estimate.expiresAt)}.`
        : null,
      "Open your portal to review the line items and approve or decline the work — nothing starts until you do.",
    ]
      .filter((line): line is string => line !== null)
      .join("\n\n"),
    context: `Estimate #${estimate.number}`,
    portalPath: `/portal/estimates/${estimate.id}`,
  });

  revalidatePath("/estimates");
  revalidatePath(`/estimates/${estimate.id}`);
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
