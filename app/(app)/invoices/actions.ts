"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals, parseCents } from "@/lib/money";
import { withNextNumber } from "@/lib/sequence";
import { fromDateInputValue } from "@/components/billing/format";
import {
  formError,
  formSuccess,
  parseLines,
  type FormState,
} from "@/components/billing/types";

/**
 * Invoice mutations.
 *
 * Every action re-reads its target with `findFirst({ id, shopId })` so a forged
 * id from another tenant 404s instead of leaking or mutating a row — the
 * session is the only source of truth for `shopId`, never the form.
 *
 * STATUS RULES (enforced here, mirrored in the UI as disabled buttons):
 *   DRAFT  → SENT              Mark sent
 *   DRAFT  → VOID              Void (OWNER only, no payments)
 *   SENT   → VOID              Void (OWNER only, no payments)
 *   any of DRAFT/SENT/PARTIAL  → PARTIAL when a payment leaves a balance
 *   any of DRAFT/SENT/PARTIAL  → PAID    when a payment clears the balance
 *   PAID / VOID                terminal — lines are frozen, no new payments
 */

type Line = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serial: string | null;
};

const EDITABLE_STATUSES = ["DRAFT", "SENT"] as const;

/** Resolves the customer, refusing anything outside the session's shop. */
async function resolveCustomer(shopId: string, raw: FormDataEntryValue | null) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  return db.customer.findFirst({ where: { id, shopId } });
}

/** Optional ticket link; a ticket from another shop is silently dropped. */
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
    serial: line.serial,
    sortOrder: index,
  }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createInvoiceAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this invoice.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { taxRateBps: true },
  });

  const ticketId = await resolveTicketId(shopId, formData.get("ticketId"));

  const invoice = await withNextNumber(shopId, "invoice", (number) =>
    db.invoice.create({
      data: {
        shopId,
        customerId: customer.id,
        ticketId,
        number,
        status: "DRAFT",
        // Snapshot the rate now — a later settings change must not silently
        // restate an invoice the customer has already been shown.
        taxRateBps: shop?.taxRateBps ?? 0,
        notes: readNotes(formData),
        dueDate: fromDateInputValue(formData.get("date")),
        lines: { create: lineCreateData(parsed.lines) },
      },
      select: { id: true },
    })
  );

  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

// ---------------------------------------------------------------------------
// Edit lines
// ---------------------------------------------------------------------------

export async function updateInvoiceAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: { id: true, status: true },
  });
  if (!invoice) return formError("That invoice no longer exists.");

  if (!EDITABLE_STATUSES.includes(invoice.status as "DRAFT" | "SENT")) {
    return formError(
      `A ${invoice.status.toLowerCase()} invoice cannot be edited. Void it and raise a new one instead.`
    );
  }

  const customer = await resolveCustomer(shopId, formData.get("customerId"));
  if (!customer) return formError("Choose a customer for this invoice.");

  const parsed = parseLines(formData.get("lines"));
  if (!parsed.ok) return formError(parsed.error);

  // Replace-all rather than diff: line ids are not surfaced to the client, and
  // an invoice has a handful of rows, so a clean rewrite is both simpler and
  // immune to a stale id from a concurrent edit.
  await db.$transaction([
    db.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } }),
    db.invoice.update({
      where: { id: invoice.id },
      data: {
        customerId: customer.id,
        notes: readNotes(formData),
        dueDate: fromDateInputValue(formData.get("date")),
        lines: { create: lineCreateData(parsed.lines) },
      },
    }),
  ]);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  redirect(`/invoices/${invoice.id}`);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function takePaymentAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId, userId } = await requireUser();

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    include: { lines: true, payments: true },
  });
  if (!invoice) return formError("That invoice no longer exists.");
  if (invoice.status === "VOID") {
    return formError("This invoice is void — it cannot take payments.");
  }

  const method = String(formData.get("method") ?? "CARD").toUpperCase();
  if (!["CASH", "CARD", "CHECK", "OTHER", "CREDIT"].includes(method)) {
    return formError("Pick a payment method.");
  }

  const amountCents = parseCents(String(formData.get("amount") ?? ""));
  if (amountCents <= 0) return formError("Enter an amount greater than zero.");

  const totals = invoiceTotals(
    invoice.lines,
    invoice.taxRateBps,
    invoice.payments
  );
  if (totals.totalCents <= 0) {
    return formError("Add line items before taking a payment.");
  }
  if (amountCents > totals.balanceCents) {
    return formError(
      `That is more than the ${formatCents(totals.balanceCents)} still outstanding.`
    );
  }

  const reference = String(formData.get("reference") ?? "").trim() || null;
  const balanceAfter = totals.balanceCents - amountCents;
  const nextStatus = balanceAfter <= 0 ? "PAID" : "PARTIAL";

  try {
    await db.$transaction(async (tx) => {
      // Store credit is real money already held for the customer, so drawing it
      // down and writing the payment must succeed or fail together.
      if (method === "CREDIT") {
        const customer = await tx.customer.findFirst({
          where: { id: invoice.customerId, shopId },
          select: { id: true, creditBalanceCents: true },
        });
        if (!customer) throw new Error("Customer not found.");
        if (customer.creditBalanceCents < amountCents) {
          throw new Error(
            `Only ${formatCents(customer.creditBalanceCents)} of store credit is available.`
          );
        }
        await tx.customer.update({
          where: { id: customer.id },
          data: { creditBalanceCents: { decrement: amountCents } },
        });
      }

      await tx.payment.create({
        data: {
          shopId,
          invoiceId: invoice.id,
          amountCents,
          method: method as "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT",
          reference,
          takenById: userId,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
          paidAt: balanceAfter <= 0 ? new Date() : null,
        },
      });
    });
  } catch (error) {
    return formError(
      error instanceof Error ? error.message : "Could not record that payment."
    );
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  return formSuccess();
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export async function markInvoiceSentAction(formData: FormData): Promise<void> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id, shopId, status: "DRAFT" },
    include: { customer: true, lines: true },
  });
  if (!invoice) return;

  const totals = invoiceTotals(invoice.lines, invoice.taxRateBps);

  await db.$transaction([
    db.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } }),
    // Phase 2 wires this to a real mail provider. Logging it now means the
    // customer's communication history is already complete when it lands.
    db.communicationLog.create({
      data: {
        shopId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        ticketId: invoice.ticketId,
        type: "EMAIL",
        direction: "OUT",
        to: invoice.customer.email ?? "—",
        subject: `Invoice #${invoice.number}`,
        body:
          `Invoice #${invoice.number} for ${formatCents(totals.totalCents)} ` +
          `was marked as sent to ${invoice.customer.firstName} ${invoice.customer.lastName}.`,
        status: "logged",
      },
    }),
  ]);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  // Voiding erases a receivable, so it is an owner-level act.
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return;

  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    select: { id: true, status: true, _count: { select: { payments: true } } },
  });
  if (!invoice) return;
  // Money has changed hands — voiding would orphan the payment history.
  if (invoice._count.payments > 0) return;
  if (invoice.status === "VOID") return;

  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: "VOID", paidAt: null },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
}

export async function saveInvoiceSignatureAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const signature = String(formData.get("signature") ?? "");
  if (!signature.startsWith("data:image/png;base64,")) {
    return formError("Capture a signature before saving.");
  }
  // A generous ceiling on a PNG of a scribble; keeps a hostile client from
  // stuffing megabytes into a text column.
  if (signature.length > 400_000) {
    return formError("That signature image is too large.");
  }

  const updated = await db.invoice.updateMany({
    where: { id, shopId },
    data: { signatureDataUrl: signature },
  });
  if (updated.count === 0) return formError("That invoice no longer exists.");

  revalidatePath(`/invoices/${id}`);
  return formSuccess();
}
