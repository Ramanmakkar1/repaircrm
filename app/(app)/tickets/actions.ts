"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { withNextNumber } from "@/lib/sequence";
import { parseCents } from "@/lib/money";
import { asPriority, isResolved } from "@/components/tickets/ticket-meta";
import type { ActionState } from "@/components/tickets/action-state";

/**
 * Every action here re-reads the session and verifies the target row belongs to
 * the session's shop BEFORE touching it. An id that arrived over the wire is
 * never trusted — see the multi-tenancy contract in lib/db.ts.
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

/**
 * Reads a `<input type="date">` value as LOCAL midnight.
 *
 * `new Date("2026-08-24")` is specified to parse a bare date as *UTC* midnight,
 * which renders as the 23rd for anyone west of UTC — so a due date typed as the
 * 24th would read back as the 23rd. Splitting the parts and using the
 * multi-arg Date constructor pins it to the shop's own calendar day.
 */
function optionalDate(fd: FormData, key: string): Date | null {
  const value = str(fd, key);
  if (!value) return null;

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Scoped lookups
// ---------------------------------------------------------------------------

/** Returns the ticket only if it belongs to this shop; null otherwise. */
async function findTicket(shopId: string, ticketId: string) {
  if (!ticketId) return null;
  return db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: {
      id: true,
      shopId: true,
      number: true,
      subject: true,
      status: true,
      customerId: true,
      customer: { select: { email: true } },
    },
  });
}

function revalidateTicket(ticketId: string) {
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

/**
 * Verifies the id belongs to `shopId` and that the referenced customer matches,
 * so a form can't staple another shop's asset (or another customer's) onto a
 * ticket by posting a guessed id.
 */
async function validAssetId(
  shopId: string,
  customerId: string,
  assetId: string | null,
): Promise<string | null> {
  if (!assetId) return null;
  const asset = await db.asset.findFirst({
    where: { id: assetId, shopId, customerId },
    select: { id: true },
  });
  return asset?.id ?? null;
}

async function validUserId(
  shopId: string,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const user = await db.user.findFirst({
    where: { id: userId, shopId },
    select: { id: true },
  });
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId, userId } = await requireUser();

  const customerId = str(formData, "customerId");
  const subject = str(formData, "subject");
  const problemType = str(formData, "problemType");

  if (!customerId) return { error: "Pick a customer for this ticket." };
  if (!subject) return { error: "A subject is required." };
  if (!problemType) return { error: "Pick a problem type." };

  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true },
  });
  if (!customer) return { error: "That customer no longer exists." };

  const defaultLocation = await db.location.findFirst({
    where: { shopId, isDefault: true },
    select: { id: true },
  });

  // Resolved up front: `withNextNumber`'s callback must stay synchronous in the
  // object literal it builds, and these are ownership checks, not formatting.
  const assetId = await validAssetId(
    shopId,
    customerId,
    optionalId(formData, "assetId"),
  );
  const assignedToId = await validUserId(
    shopId,
    optionalId(formData, "assignedToId"),
  );

  const ticket = await withNextNumber(shopId, "ticket", (number) =>
    db.ticket.create({
      data: {
        shopId,
        number,
        customerId,
        locationId: defaultLocation?.id ?? null,
        assetId,
        subject,
        problemType,
        status: str(formData, "status") || "New",
        priority: asPriority(str(formData, "priority")),
        assignedToId,
        dueDate: optionalDate(formData, "dueDate"),
        diagnosticNotes: str(formData, "diagnosticNotes") || null,
        comments: {
          create: {
            shopId,
            authorId: userId,
            body: "Ticket created.",
            isPublic: false,
            updateType: "Created",
            channel: "NOTE",
          },
        },
      },
      select: { id: true },
    }),
  );

  revalidatePath("/tickets");
  // redirect() throws to unwind — never put it inside a try/catch.
  redirect(`/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Edit / delete
// ---------------------------------------------------------------------------

export async function updateTicketAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const subject = str(formData, "subject");
  if (!subject) return { error: "A subject is required." };

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      subject,
      problemType: str(formData, "problemType") || undefined,
      priority: asPriority(str(formData, "priority")),
      assignedToId: await validUserId(
        shopId,
        optionalId(formData, "assignedToId"),
      ),
      assetId: await validAssetId(
        shopId,
        ticket.customerId,
        optionalId(formData, "assetId"),
      ),
      dueDate: optionalDate(formData, "dueDate"),
      diagnosticNotes: str(formData, "diagnosticNotes") || null,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/** OWNER only — a tech deleting a job would take its charges and time with it. */
export async function deleteTicketAction(ticketId: string): Promise<void> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return;

  // deleteMany doubles as the ownership check: a foreign id matches 0 rows.
  const { count } = await db.ticket.deleteMany({ where: { id: ticketId, shopId } });
  if (count === 0) return;

  revalidatePath("/tickets");
  redirect("/tickets");
}

// ---------------------------------------------------------------------------
// The update composer — status change + logged note, in one submit
// ---------------------------------------------------------------------------

export async function postUpdateAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId, userId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const nextStatus = str(formData, "status") || ticket.status;
  const statusChanged = nextStatus !== ticket.status;
  const isPublic = bool(formData, "isPublic");
  const body = str(formData, "body");

  if (!body && !statusChanged) {
    return { error: "Write a note, or change the status." };
  }
  if (isPublic && !body) {
    return { error: "A customer-facing update needs a message." };
  }

  const subject =
    str(formData, "subject") ||
    (isPublic ? `Update on ticket #${ticket.number}` : null);

  // A status-only submit still gets a body so the timeline never has a blank row.
  const commentBody = body || `Status changed to ${nextStatus}.`;

  await db.$transaction(async (tx) => {
    if (statusChanged) {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          // Entering Resolved stamps the clock; leaving it clears the stamp so a
          // reopened ticket doesn't report a bogus resolution date.
          resolvedAt: isResolved(nextStatus) ? new Date() : null,
        },
      });
    } else {
      // No status change still counts as activity — bump updatedAt so the
      // staleness heat on the list resets.
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date() },
      });
    }

    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: ticket.id,
        authorId: userId,
        body: commentBody,
        isPublic,
        subject,
        updateType: statusChanged ? nextStatus : null,
        channel: "NOTE",
      },
    });

    if (isPublic) {
      // Phase 2 does the actual sending. For now the outbox row is the record
      // that the customer was told — status says whether it is deliverable.
      const to = ticket.customer.email;
      await tx.communicationLog.create({
        data: {
          shopId,
          customerId: ticket.customerId,
          ticketId: ticket.id,
          type: "EMAIL",
          direction: "OUT",
          to: to ?? "",
          subject,
          body: commentBody,
          status: to ? "logged" : "no-address",
        },
      });
    }
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

export async function addChargeAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const productId = optionalId(formData, "productId");
  let description = str(formData, "description");
  let unitPriceCents = parseCents(str(formData, "unitPrice"));
  let taxable = bool(formData, "taxable");

  if (productId) {
    const product = await db.product.findFirst({
      where: { id: productId, shopId },
      select: { name: true, priceCents: true, taxable: true },
    });
    if (!product) return { error: "That product no longer exists." };
    // The product is the source of truth for anything the form left blank.
    description = description || product.name;
    if (!str(formData, "unitPrice")) unitPriceCents = product.priceCents;
    if (!formData.has("taxable")) taxable = product.taxable;
  }

  if (!description) return { error: "Describe the charge." };

  const quantity = Math.max(1, Math.round(Number(str(formData, "quantity")) || 1));

  await db.ticketCharge.create({
    data: {
      shopId,
      ticketId: ticket.id,
      productId,
      description,
      quantity,
      unitPriceCents,
      taxable,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

export async function updateChargeAction(
  chargeId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();

  const charge = await db.ticketCharge.findFirst({
    where: { id: chargeId, shopId },
    select: { id: true, ticketId: true, invoiceId: true },
  });
  if (!charge) return { error: "Charge not found." };
  if (charge.invoiceId) {
    return { error: "This charge is on an invoice — edit it there instead." };
  }

  const description = str(formData, "description");
  if (!description) return { error: "Describe the charge." };

  await db.ticketCharge.update({
    where: { id: charge.id },
    data: {
      description,
      quantity: Math.max(1, Math.round(Number(str(formData, "quantity")) || 1)),
      unitPriceCents: parseCents(str(formData, "unitPrice")),
      taxable: bool(formData, "taxable"),
    },
  });

  revalidateTicket(charge.ticketId);
  return { ok: true };
}

export async function deleteChargeAction(chargeId: string): Promise<void> {
  const { shopId } = await requireUser();

  const charge = await db.ticketCharge.findFirst({
    where: { id: chargeId, shopId, invoiceId: null },
    select: { id: true, ticketId: true },
  });
  if (!charge) return;

  await db.ticketCharge.delete({ where: { id: charge.id } });
  revalidateTicket(charge.ticketId);
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

export async function startTimerAction(ticketId: string): Promise<void> {
  const { shopId, userId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return;

  // One running timer per user per ticket. A double-click is a no-op, not a
  // second entry that would double-bill the customer.
  const running = await db.timeEntry.findFirst({
    where: { shopId, ticketId: ticket.id, userId, endedAt: null },
    select: { id: true },
  });
  if (running) return;

  await db.timeEntry.create({
    data: { shopId, ticketId: ticket.id, userId, startedAt: new Date() },
  });
  revalidateTicket(ticket.id);
}

export async function stopTimerAction(
  ticketId: string,
  formData: FormData,
): Promise<void> {
  const { shopId, userId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return;

  const running = await db.timeEntry.findFirst({
    where: { shopId, ticketId: ticket.id, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });
  if (!running) return;

  const endedAt = new Date();
  await db.timeEntry.update({
    where: { id: running.id },
    data: {
      endedAt,
      seconds: Math.max(
        0,
        Math.round((endedAt.getTime() - running.startedAt.getTime()) / 1000),
      ),
      note: str(formData, "note") || null,
    },
  });
  revalidateTicket(ticket.id);
}

export async function deleteTimeEntryAction(entryId: string): Promise<void> {
  const { shopId } = await requireUser();

  const entry = await db.timeEntry.findFirst({
    where: { id: entryId, shopId },
    select: { id: true, ticketId: true },
  });
  if (!entry) return;

  await db.timeEntry.delete({ where: { id: entry.id } });
  revalidateTicket(entry.ticketId);
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

/**
 * Replaces the whole `customFields` blob from parallel `fieldKey` / `fieldValue`
 * inputs. Blank keys are dropped, later duplicates win.
 */
export async function saveCustomFieldsAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const keys = formData.getAll("fieldKey");
  const values = formData.getAll("fieldValue");

  const fields: Record<string, string> = {};
  keys.forEach((rawKey, i) => {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (!key) return;
    const rawValue = values[i];
    fields[key] = typeof rawValue === "string" ? rawValue.trim() : "";
  });

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      // Prisma reads a bare `null` as "leave alone" on a Json column — clearing
      // the blob needs the explicit JsonNull sentinel.
      customFields:
        Object.keys(fields).length > 0 ? fields : Prisma.JsonNull,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

export async function createCannedResponseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();

  const title = str(formData, "title");
  const body = str(formData, "body");
  if (!title) return { error: "Give the response a title." };
  if (!body) return { error: "The response needs a body." };

  await db.cannedResponse.create({ data: { shopId, title, body } });

  revalidatePath("/tickets", "layout");
  return { ok: true };
}

export async function deleteCannedResponseAction(id: string): Promise<void> {
  const { shopId } = await requireUser();
  await db.cannedResponse.deleteMany({ where: { id, shopId } });
  revalidatePath("/tickets", "layout");
}

// ---------------------------------------------------------------------------
// Ticket -> Invoice
// ---------------------------------------------------------------------------

/**
 * Sweeps every un-invoiced charge on the ticket onto a new DRAFT invoice.
 *
 * The tax rate is snapshotted from the shop at creation time so a later rate
 * change can't silently re-price an issued document. Charges are stamped with
 * `invoiceId`, which is what makes them read-only on the ticket from here on.
 */
// Takes no state/formData: a shorter parameter list is still assignable to what
// `useActionState` expects, and there is nothing on the form to read.
export async function makeInvoiceAction(ticketId: string): Promise<ActionState> {
  const { shopId, userId } = await requireUser();

  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: {
      id: true,
      number: true,
      customerId: true,
      charges: {
        where: { invoiceId: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
        },
      },
    },
  });

  if (!ticket) return { error: "Ticket not found." };
  if (ticket.charges.length === 0) {
    return { error: "There are no un-invoiced charges on this ticket yet." };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { taxRateBps: true },
  });

  const charges = ticket.charges;

  const invoice = await withNextNumber(shopId, "invoice", (number) =>
    db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          shopId,
          customerId: ticket.customerId,
          ticketId: ticket.id,
          number,
          status: "DRAFT",
          taxRateBps: shop?.taxRateBps ?? 0,
          lines: {
            create: charges.map((charge, index) => ({
              productId: charge.productId,
              description: charge.description,
              quantity: charge.quantity,
              unitPriceCents: charge.unitPriceCents,
              taxable: charge.taxable,
              sortOrder: index,
            })),
          },
        },
        select: { id: true, number: true },
      });

      await tx.ticketCharge.updateMany({
        where: { id: { in: charges.map((c) => c.id) }, shopId },
        data: { invoiceId: created.id },
      });

      await tx.ticketComment.create({
        data: {
          shopId,
          ticketId: ticket.id,
          authorId: userId,
          body: `Invoice #${created.number} created from ${charges.length} charge${
            charges.length === 1 ? "" : "s"
          }.`,
          isPublic: false,
          updateType: "Invoiced",
          channel: "NOTE",
        },
      });

      return created;
    }),
  );

  revalidateTicket(ticket.id);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}
