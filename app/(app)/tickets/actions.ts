"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { checklistFromTemplate } from "@/lib/checklist";
import { newRecordLocationId, validLocationId } from "@/lib/location";
import { warrantyDaysByProduct } from "@/lib/warranty";
import { slaDueDate } from "@/lib/sla";
import { sendEmail, sendSms } from "@/lib/comms";
import { emitTicketEvent } from "@/lib/events";
import { withNextNumber } from "@/lib/sequence";
import { applyTicketDeposits } from "@/lib/deposits";
import { readLabourSettings } from "@/lib/labour";
import { bulkIds, plural, type BulkResult } from "@/lib/bulk";
import { calcTotals, parseCents } from "@/lib/money";
import { labourLinesFor, loadBillableTime } from "@/lib/time-billing";
import { resolveDocumentTax } from "@/components/billing/queries";
import {
  asPriority,
  isReadyForPickup,
  isResolved,
  READY_FOR_PICKUP_STATUS,
  RESOLVED_STATUS,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";
import {
  IN_PROGRESS_STATUS,
  isTerminalPartStatus,
  WAITING_FOR_PARTS_STATUS,
  type PartActionState,
} from "@/components/tickets/part-meta";
import type { ActionState } from "@/components/tickets/action-state";
import { newCustomerSchema, newDeviceSchema, splitCustomerName, promisedDate } from "@/lib/intake";

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

/** Checklist picker: "let the problem type decide" — see resolveChecklist. */
const AUTO = "auto";

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
      customer: { select: { email: true, mobile: true, smsOptIn: true } },
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

/**
 * Verifies a warranty claim points at a line the SAME customer actually bought
 * from this shop, so a guessed line id cannot staple somebody else's purchase
 * (or another tenant's) onto a ticket.
 */
async function validWarrantyLineId(
  shopId: string,
  customerId: string,
  lineId: string | null,
): Promise<string | null> {
  if (!lineId) return null;
  const line = await db.invoiceLine.findFirst({
    where: {
      id: lineId,
      warrantyDays: { not: null },
      invoice: { shopId, customerId, status: { not: "VOID" } },
    },
    select: { id: true },
  });
  return line?.id ?? null;
}

/**
 * The checklist a new ticket starts with: the template the form named, or —
 * when the form left it on "auto" — the one that claims this problem type.
 * Items are COPIED onto the ticket so editing the template later never
 * rewrites a job already on the bench.
 */
async function resolveChecklist(
  shopId: string,
  templateId: string | null,
  problemType: string,
  auto: boolean,
): Promise<{ items: Prisma.InputJsonValue | undefined; templateId: string | null }> {
  const template = templateId
    ? await db.checklistTemplate.findFirst({
        where: { id: templateId, shopId, active: true },
        select: { id: true, items: true },
      })
    : auto
      ? await db.checklistTemplate.findFirst({
          where: { shopId, active: true, problemType },
          orderBy: { createdAt: "asc" },
          select: { id: true, items: true },
        })
      : null;

  if (!template) return { items: undefined, templateId: null };

  const items = checklistFromTemplate(template.items as string[]);
  if (items.length === 0) return { items: undefined, templateId: null };

  return {
    items: items as unknown as Prisma.InputJsonValue,
    templateId: template.id,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId, userId } = await requireUser();

  const selectedCustomerId = str(formData, "customerId");
  const isNewCustomer = selectedCustomerId === "__new__";
  let customerId = isNewCustomer ? "" : selectedCustomerId;
  const subject = str(formData, "subject");
  const problemType = str(formData, "problemType");

  if (!selectedCustomerId) return { error: "Pick a customer for this ticket." };
  if (!subject) return { error: "A subject is required." };
  if (subject.length > 200 || problemType.length > 80) return { error: "Shorten the subject or problem type." };
  if (!problemType) return { error: "Pick a problem type." };

  const newCustomer = isNewCustomer ? newCustomerSchema.safeParse({ name: str(formData, "newCustomerName"), email: str(formData, "newCustomerEmail").toLowerCase(), phone: str(formData, "newCustomerPhone") }) : null;
  if (newCustomer && !newCustomer.success) return { error: newCustomer.error.issues[0].message };
  const newDevice = str(formData, "assetId") === "__new__" ? newDeviceSchema.safeParse({ type: str(formData, "newDeviceType"), make: str(formData, "newDeviceMake"), model: str(formData, "newDeviceModel"), serial: str(formData, "newDeviceSerial"), password: str(formData, "newDevicePassword") }) : null;
  if (newDevice && !newDevice.success) return { error: "Check the new device details." };
  if (newCustomer?.success) {
    const matches: Prisma.CustomerWhereInput[] = [];
    if (newCustomer.data.email) matches.push({ email: { equals: newCustomer.data.email, mode: "insensitive" } });
    if (newCustomer.data.phone) matches.push({ phone: newCustomer.data.phone }, { mobile: newCustomer.data.phone });
    const duplicate = matches.length ? await db.customer.findFirst({ where: { shopId, OR: matches }, select: { firstName: true, lastName: true } }) : null;
    if (duplicate) return { error: `This contact matches ${duplicate.firstName} ${duplicate.lastName}. Select that existing customer to avoid a duplicate.` };
  }
  const quotedPriceCents = str(formData, "quotedPrice") ? parseCents(str(formData, "quotedPrice")) : null;
  const inspectionFeeCents = parseCents(str(formData, "inspectionFee"));
  if ([quotedPriceCents ?? 0, inspectionFeeCents].some(v => v < 0 || v > 100_000_000)) return { error: "Enter valid non-negative prices." };
  const promisedAt = promisedDate(str(formData, "promisedAt"));
  if (str(formData, "promisedAt") && !promisedAt) return { error: "Choose a valid pickup date and time." };

  const customer = isNewCustomer ? null : await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true },
  });
  if (!isNewCustomer && !customer) return { error: "That customer no longer exists." };

  // The branch on screen, else the user's own, else the shop default. A form
  // that named one wins, but only if it is this shop's and still open.
  const locationId =
    (await validLocationId(shopId, optionalId(formData, "locationId"))) ??
    (await newRecordLocationId(shopId, userId));

  // Resolved up front: `withNextNumber`'s callback must stay synchronous in the
  // object literal it builds, and these are ownership checks, not formatting.
  const assetId = isNewCustomer || newDevice ? null : await validAssetId(
    shopId,
    customerId,
    optionalId(formData, "assetId"),
  );
  const assignedToId = await validUserId(
    shopId,
    optionalId(formData, "assignedToId"),
  );

  const priority = asPriority(str(formData, "priority"));

  // No date typed in? The shop's response target for this priority decides it,
  // which is what makes "Overdue" mean something on a board nobody dated.
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  const dueDate =
    promisedAt ?? optionalDate(formData, "dueDate") ?? slaDueDate(shop?.settings, priority);

  // A checklist named on the form wins; on "auto" (the default, and what a
  // form with no picker at all sends) the template that claims this problem
  // type attaches itself; "none" attaches nothing.
  const checklistChoice = str(formData, "checklistTemplateId");
  const checklist = await resolveChecklist(
    shopId,
    checklistChoice && checklistChoice !== NONE && checklistChoice !== AUTO
      ? checklistChoice
      : null,
    problemType,
    checklistChoice === "" || checklistChoice === AUTO,
  );

  const warrantyLineId = isNewCustomer ? null : await validWarrantyLineId(
    shopId,
    customerId,
    optionalId(formData, "warrantyInvoiceLineId"),
  );

  const ticket = await withNextNumber(shopId, "ticket", (number) => db.$transaction(async tx => {
    if (newCustomer?.success) {
      const created = await tx.customer.create({ data: { shopId, ...splitCustomerName(newCustomer.data.name), email: newCustomer.data.email || null, phone: newCustomer.data.phone || null, mobile: newCustomer.data.phone || null, smsOptIn: false, emailOptIn: false } });
      customerId = created.id;
    }
    let deviceId = assetId;
    if (newDevice?.success) {
      const created = await tx.asset.create({ data: { shopId, customerId, ...newDevice.data, password: newDevice.data.password || null } });
      deviceId = created.id;
    }
    return tx.ticket.create({
      data: {
        shopId,
        number,
        customerId,
        locationId,
        assetId: deviceId,
        subject,
        problemType,
        status: str(formData, "status") || "New",
        priority,
        assignedToId,
        dueDate,
        checklist: checklist.items,
        checklistTemplateId: checklist.templateId,
        isWarranty: warrantyLineId !== null,
        warrantyInvoiceLineId: warrantyLineId,
        diagnosticNotes: str(formData, "diagnosticNotes") || null,
        customFields: { quotedPriceCents, termsAcceptedAt: bool(formData, "termsAccepted") ? new Date().toISOString() : null },
        ...(inspectionFeeCents > 0 ? { charges: { create: { shopId, description: "Inspection fee", quantity: 1, unitPriceCents: inspectionFeeCents, taxable: true } } } : {}),
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
    });
  }),
  );

  await emitTicketEvent(shopId, "ticket.created", ticket.id);

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

  const warrantyLineId = await validWarrantyLineId(
    shopId,
    ticket.customerId,
    optionalId(formData, "warrantyInvoiceLineId"),
  );

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
      // The claim is only kept when the line is still one of THIS customer's
      // warranted purchases — clearing the picker clears the flag with it.
      warrantyInvoiceLineId: warrantyLineId,
      isWarranty: warrantyLineId !== null,
      diagnosticNotes: str(formData, "diagnosticNotes") || null,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/** OWNER only — a tech deleting a job would take its charges and time with it. */
export async function deleteTicketAction(ticketId: string): Promise<void> {
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER") return;

  // Read the number before the row goes, so the audit line means something.
  /*
    Prisma reads `id: undefined` as "no filter", so `deleteMany({ where: { id,
    shopId } })` with a missing id does not delete nothing — it deletes the
    SHOP'S ENTIRE TABLE. This codebase has already been bitten by exactly that
    shape once (canned responses), which is why the guard is spelled out at
    every call site rather than assumed at the caller.
  */
  if (typeof ticketId !== "string" || !ticketId) return;

  const doomed = await db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: { number: true },
  });

  // deleteMany doubles as the ownership check: a foreign id matches 0 rows.
  const { count } = await db.ticket.deleteMany({ where: { id: ticketId, shopId } });
  if (count === 0) return;

  await audit({
    shopId,
    userId,
    action: "ticket.deleted",
    entity: "ticket",
    entityId: ticketId,
    summary: `Deleted ticket #${doomed?.number ?? "?"}`,
  });

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
  });

  if (statusChanged) {
    await emitTicketEvent(shopId, "ticket.status_changed", ticket.id);
    if (isResolved(nextStatus)) {
      await emitTicketEvent(shopId, "ticket.resolved", ticket.id);
    }
  }

  // Sending happens AFTER the transaction commits, never inside it: a mail
  // provider timing out must not roll back the status change and the note that
  // are already true. lib/comms writes the single outbox row itself — including
  // when it skips (opted out / no address), so the history stays complete.
  if (isPublic) {
    const emailSubject = subject ?? `Update on ticket #${ticket.number}`;

    await sendEmail({
      shopId,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      subject: emailSubject,
      body: commentBody,
      context: `Ticket #${ticket.number} · ${ticket.subject}`,
      portalPath: `/portal/tickets/${ticket.id}`,
    });

    // A text is a nudge, not a second copy of the email — it only goes to a
    // customer who asked for texts and gave us a mobile to use.
    if (ticket.customer.smsOptIn && ticket.customer.mobile) {
      await sendSms({
        shopId,
        customerId: ticket.customerId,
        ticketId: ticket.id,
        body: `Ticket #${ticket.number} — ${commentBody}`,
        portalPath: `/portal/tickets/${ticket.id}`,
      });
    }
  }

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
// Part orders
// ---------------------------------------------------------------------------

/**
 * PART SOURCING ("Part Order / Parts Status").
 *
 * A PartOrder is the *procurement* record for a ticket: what has to be sourced,
 * from whom, for how much, and where it has got to. It is deliberately NOT a
 * TicketCharge — a part can be ordered and arrive without ever being billed
 * (warranty, goodwill, a spare that turned out not to be needed), and a charge
 * can exist for a part that was already on the shelf. Charges are what the
 * customer pays; part orders are what the shop is waiting on.
 *
 * LIFECYCLE
 *   NEEDED ──▶ ORDERED ──▶ RECEIVED   (terminal)
 *      └──────────┴──────▶ CANCELED   (terminal)
 *
 * Each hop stamps its own clock (orderedAt / receivedAt) so "how long has this
 * been on order?" is answerable afterwards. RECEIVED and CANCELED are terminal
 * because receiving already moved stock — see below — and un-receiving would
 * leave that movement stranded.
 *
 * RECEIVING MOVES STOCK. When the part is linked to a catalogue Product,
 * marking it received increments `Product.stockQty` and writes the matching
 * `StockAdjustment` row inside the SAME transaction as the status change — the
 * audited path every other stock movement in the app uses (inventory receiving,
 * POS selling). A free-form part has no product row and therefore no stock to
 * move; it just changes status.
 *
 * ONE EXCEPTION: a part attached to a purchase order (`purchaseOrderId` set).
 * There, receiving the PO is the stock event and this path only flips the
 * status — otherwise the same box would be counted onto the shelf twice.
 */

const RECEIVABLE_FROM: readonly string[] = ["NEEDED", "ORDERED"];

/** Returns the part order only if it belongs to this shop; null otherwise. */
async function findPartOrder(shopId: string, partOrderId: string) {
  if (!partOrderId) return null;
  return db.partOrder.findFirst({
    where: { id: partOrderId, shopId },
    select: {
      id: true,
      ticketId: true,
      productId: true,
      description: true,
      quantity: true,
      status: true,
      purchaseOrderId: true,
      ticket: { select: { number: true, status: true } },
    },
  });
}

export async function addPartOrderAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { shopId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const productId = optionalId(formData, "productId");
  const vendorId = optionalId(formData, "vendorId");
  let description = str(formData, "description");
  const typedCost = str(formData, "costCents");
  let costCents = typedCost ? parseCents(typedCost) : null;

  if (productId) {
    const product = await db.product.findFirst({
      where: { id: productId, shopId },
      select: { name: true, costCents: true },
    });
    if (!product) return { error: "That product no longer exists." };
    // The catalogue fills in anything the form left blank. `costCents` (what
    // the shop pays) is the right default here, not `priceCents` (what the
    // customer pays) — a part order is a purchase, not a sale.
    description = description || product.name;
    if (!typedCost) costCents = product.costCents;
  }

  if (!description) return { error: "Describe the part you need." };

  const quantity = Math.max(
    1,
    Math.round(Number(str(formData, "quantity")) || 1),
  );

  // A vendorId from the wire is only trusted once this shop is proved to own
  // it — it is what "Add to purchase order" later raises the PO against.
  const vendor = vendorId
    ? await db.vendor.findFirst({
        where: { id: vendorId, shopId },
        select: { id: true, name: true },
      })
    : null;

  await db.partOrder.create({
    data: {
      shopId,
      ticketId: ticket.id,
      productId,
      vendorId: vendor?.id ?? null,
      description,
      // The typed supplier still wins; the vendor name only fills a blank, so
      // the card reads the same whichever way the part was entered.
      supplier: str(formData, "supplier") || vendor?.name || null,
      quantity,
      costCents: costCents !== null && costCents > 0 ? costCents : null,
      status: "NEEDED",
      expectedAt: optionalDate(formData, "expectedAt"),
      notes: str(formData, "notes") || null,
    },
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

/** NEEDED → ORDERED. Stamps the clock the "how long has this been out?" reads. */
export async function markPartOrderedAction(
  partOrderId: string,
): Promise<PartActionState> {
  const { shopId, userId } = await requireUser();
  const part = await findPartOrder(shopId, partOrderId);
  if (!part) return { error: "Part order not found." };
  if (part.status !== "NEEDED") {
    return { error: `A ${part.status.toLowerCase()} part cannot be re-ordered.` };
  }

  await db.$transaction(async (tx) => {
    await tx.partOrder.update({
      where: { id: part.id },
      data: { status: "ORDERED", orderedAt: new Date() },
    });
    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: part.ticketId,
        authorId: userId,
        body: `Part ordered: ${part.quantity} × ${part.description}.`,
        isPublic: false,
        updateType: "Part ordered",
        channel: "NOTE",
      },
    });
  });

  revalidateTicket(part.ticketId);
  return { ok: true };
}

/**
 * NEEDED/ORDERED → RECEIVED.
 *
 * When the part came from the catalogue this is a real stock movement, so the
 * increment and its StockAdjustment audit row are written in the same
 * transaction as the status change: either the part is on the shelf and the
 * history says so, or nothing happened at all.
 *
 * Returns `offerResume` when the ticket is parked in "Waiting for Parts" — the
 * card turns that into a one-click prompt rather than moving the ticket itself.
 */
export async function markPartReceivedAction(
  partOrderId: string,
): Promise<PartActionState> {
  const { shopId, userId } = await requireUser();
  const part = await findPartOrder(shopId, partOrderId);
  if (!part) return { error: "Part order not found." };
  if (!RECEIVABLE_FROM.includes(part.status)) {
    return { error: `A ${part.status.toLowerCase()} part cannot be received.` };
  }

  await db.$transaction(async (tx) => {
    await tx.partOrder.update({
      where: { id: part.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });

    // STOCK IS COUNTED IN EXACTLY ONCE. When this part rides on a purchase
    // order, receiving THAT order is the stock event: it already incremented
    // the product and wrote the StockAdjustment (see
    // app/(app)/inventory/purchase-orders/actions.ts). Doing it again here
    // would count the same physical part onto the shelf twice, so this path
    // only changes status when `purchaseOrderId` is set.
    if (part.productId && !part.purchaseOrderId) {
      // Scoped update: an id that does not belong to this shop matches nothing,
      // and the adjustment below would then describe a movement that never
      // happened — so the write is guarded by the same where clause.
      const moved = await tx.product.updateMany({
        where: { id: part.productId, shopId },
        data: { stockQty: { increment: part.quantity } },
      });
      if (moved.count > 0) {
        await tx.stockAdjustment.create({
          data: {
            shopId,
            productId: part.productId,
            delta: part.quantity,
            reason: `Part received — ticket #${part.ticket.number}`,
            userId,
          },
        });
      }
    }

    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: part.ticketId,
        authorId: userId,
        body: `Part received: ${part.quantity} × ${part.description}.`,
        isPublic: false,
        updateType: "Part received",
        channel: "NOTE",
      },
    });
  });

  revalidateTicket(part.ticketId);
  revalidatePath("/inventory");

  return {
    ok: true,
    offerResume: part.ticket.status === WAITING_FOR_PARTS_STATUS,
  };
}

/** NEEDED/ORDERED → CANCELED. Never touches stock: nothing ever arrived. */
export async function cancelPartOrderAction(
  partOrderId: string,
): Promise<PartActionState> {
  const { shopId, userId } = await requireUser();
  const part = await findPartOrder(shopId, partOrderId);
  if (!part) return { error: "Part order not found." };
  if (isTerminalPartStatus(part.status)) {
    return { error: `A ${part.status.toLowerCase()} part cannot be canceled.` };
  }

  await db.$transaction(async (tx) => {
    await tx.partOrder.update({
      where: { id: part.id },
      data: { status: "CANCELED" },
    });
    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: part.ticketId,
        authorId: userId,
        body: `Part order canceled: ${part.quantity} × ${part.description}.`,
        isPublic: false,
        updateType: "Part canceled",
        channel: "NOTE",
      },
    });
  });

  revalidateTicket(part.ticketId);
  return { ok: true };
}

/**
 * The "yes please" half of the prompt `markPartReceivedAction` offers: move a
 * ticket that was parked waiting on parts back onto the bench.
 *
 * A no-op unless the ticket is genuinely still in "Waiting for Parts" — by the
 * time the tech clicks, someone else may have moved it already.
 */
export async function resumeTicketFromPartsAction(
  ticketId: string,
): Promise<PartActionState> {
  const { shopId, userId } = await requireUser();
  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };
  if (ticket.status !== WAITING_FOR_PARTS_STATUS) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: IN_PROGRESS_STATUS, resolvedAt: null },
    });
    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: ticket.id,
        authorId: userId,
        body: `Parts are in — status changed to ${IN_PROGRESS_STATUS}.`,
        isPublic: false,
        updateType: IN_PROGRESS_STATUS,
        channel: "NOTE",
      },
    });
  });

  revalidateTicket(ticket.id);
  return { ok: true };
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
    select: { id: true, ticketId: true, invoiceId: true },
  });
  if (!entry) return;
  // Billed time belongs to an invoice the customer may already have paid.
  // Voiding that invoice releases it; until then it stays put.
  if (entry.invoiceId) return;

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

  // Prisma reads `id: undefined` as "no filter", so without this guard a
  // malformed call would delete every canned response in the shop. The same
  // guard is on the settings and checklist deletes for the same reason.
  if (typeof id !== "string" || !id) return;

  await db.cannedResponse.deleteMany({ where: { id, shopId } });
  revalidatePath("/tickets", "layout");
}

// ---------------------------------------------------------------------------
// Ticket -> Invoice
// ---------------------------------------------------------------------------

/**
 * Sweeps every un-invoiced charge on the ticket onto a new DRAFT invoice, and
 * (unless the operator unticks it) every unbilled billable time entry with it.
 *
 * The tax rate is resolved from the customer — exempt customers are taxed at
 * 0%, everyone else at their own rate or the shop default — and snapshotted at
 * creation time so a later rate change can't silently re-price an issued
 * document. Charges are stamped with `invoiceId`, which is what makes them
 * read-only on the ticket from here on; time entries are stamped the same way.
 *
 * A deposit taken at intake is spent against the invoice in the SAME
 * transaction (see lib/deposits.ts), so the bill the customer is handed already
 * has their money on it.
 */
// Takes an options object rather than state/formData: a shorter parameter list
// is still assignable to what `useActionState` expects, and the only choice on
// the confirm dialog is the one checkbox.
export async function makeInvoiceAction(
  ticketId: string,
  options?: { includeTime?: boolean },
): Promise<ActionState> {
  const { shopId, userId } = await requireUser();
  const includeTime = options?.includeTime !== false;

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

  const [shop, tax] = await Promise.all([
    db.shop.findUnique({
      where: { id: shopId },
      select: { settings: true },
    }),
    resolveDocumentTax(shopId, ticket.customerId, null),
  ]);

  const labour = readLabourSettings(shop?.settings);
  const timeEntries = includeTime
    ? await loadBillableTime(db, shopId, ticket.id)
    : [];
  const labourLines = labourLinesFor(timeEntries, labour);

  const charges = ticket.charges;
  const locationId = await newRecordLocationId(shopId, userId);
  const warranty = await warrantyDaysByProduct(
    shopId,
    charges.map((charge) => charge.productId),
  );

  if (charges.length === 0 && labourLines.length === 0) {
    return {
      error: includeTime
        ? "There are no un-invoiced charges or unbilled time on this ticket yet."
        : "There are no un-invoiced charges on this ticket yet.",
    };
  }

  const lines = [
    ...charges.map((charge) => ({
      productId: charge.productId,
      description: charge.description,
      quantity: charge.quantity,
      unitPriceCents: charge.unitPriceCents,
      taxable: charge.taxable,
    })),
    ...labourLines,
  ];

  const totalCents = calcTotals(lines, tax.taxRateBps).totalCents;

  const invoice = await withNextNumber(shopId, "invoice", (number) =>
    db.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          shopId,
          customerId: ticket.customerId,
          ticketId: ticket.id,
          locationId,
          number,
          status: "DRAFT",
          taxRateId: tax.taxRateId,
          taxRateBps: tax.taxRateBps,
          lines: {
            create: lines.map((line, index) => ({
              productId: line.productId,
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              taxable: line.taxable,
              // Warranty is snapshotted from the product at invoice time, so a
              // later catalogue edit never rewrites a bill already issued.
              // Labour lines carry no product and so no warranty.
              warrantyDays: line.productId
                ? (warranty.get(line.productId) ?? null)
                : null,
              sortOrder: index,
            })),
          },
        },
        select: { id: true, number: true },
      });

      if (charges.length > 0) {
        await tx.ticketCharge.updateMany({
          where: { id: { in: charges.map((c) => c.id) }, shopId },
          data: { invoiceId: created.id },
        });
      }

      // Stamping the entries inside the transaction is what stops the same
      // hour being billed twice by two people pressing the button at once.
      if (timeEntries.length > 0) {
        await tx.timeEntry.updateMany({
          where: {
            id: { in: timeEntries.map((entry) => entry.id) },
            shopId,
            invoiceId: null,
          },
          data: { invoiceId: created.id },
        });
      }

      const deposit = await applyTicketDeposits(tx, {
        shopId,
        ticketId: ticket.id,
        customerId: ticket.customerId,
        ticketNumber: ticket.number,
        invoiceId: created.id,
        invoiceNumber: created.number,
        totalCents,
        userId,
      });

      // A deposit that clears the bill leaves nothing to collect, so the
      // invoice is born settled rather than as a draft nobody has to action.
      if (deposit.amountCents > 0) {
        await tx.invoice.update({
          where: { id: created.id },
          data:
            deposit.amountCents >= totalCents
              ? { status: "PAID", paidAt: new Date() }
              : { status: "PARTIAL" },
        });
      }

      await tx.ticketComment.create({
        data: {
          shopId,
          ticketId: ticket.id,
          authorId: userId,
          body: invoicedNote(created.number, charges.length, timeEntries.length),
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
  revalidatePath(`/customers/${ticket.customerId}`);
  redirect(`/invoices/${invoice.id}`);
}

/** "Invoice #1004 created from 2 charges and 1 time entry." */
function invoicedNote(
  number: number,
  chargeCount: number,
  timeCount: number,
): string {
  const parts: string[] = [];
  if (chargeCount > 0) {
    parts.push(`${chargeCount} charge${chargeCount === 1 ? "" : "s"}`);
  }
  if (timeCount > 0) {
    parts.push(`${timeCount} time entr${timeCount === 1 ? "y" : "ies"}`);
  }
  return `Invoice #${number} created from ${parts.join(" and ")}.`;
}

// ---------------------------------------------------------------------------
// Pickup — the two buttons the front counter actually presses
// ---------------------------------------------------------------------------

/**
 * The canned response the pickup notice is written from. Created on first use
 * so the message is always something the shop can edit in Settings, never a
 * string frozen in this file.
 */
const PICKUP_CANNED_TITLE = "Ready for pickup";

const PICKUP_CANNED_BODY =
  "Hi {customer}, your device is repaired and ready to collect from {shop}. Please bring ticket {ticket} with you. See you soon!";

/** Fills {customer} / {ticket} / {shop} in a pickup message. */
function fillPickupTokens(
  template: string,
  values: { customer: string; ticket: string; shop: string },
): string {
  return template
    .replaceAll("{customer}", values.customer)
    .replaceAll("{ticket}", values.ticket)
    .replaceAll("{shop}", values.shop);
}

/**
 * "Notify: ready for pickup" — one press, three things.
 *
 * The status moves to Ready for Pickup, the shop's own pickup message goes out
 * (SMS when the customer asked for texts and gave us a mobile, email otherwise),
 * and the timeline gets the public comment — exactly the shape `postUpdateAction`
 * produces, so a notice sent from this button and one typed into the composer
 * read identically in the history.
 *
 * Sending happens after the transaction commits, for the same reason it does
 * there: a mail provider timing out must not roll back a status that is already
 * true of the device on the shelf.
 */
export async function notifyReadyForPickupAction(
  ticketId: string,
): Promise<ActionState> {
  const { shopId, userId } = await requireUser();

  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      customerId: true,
      customer: {
        select: { firstName: true, mobile: true, smsOptIn: true },
      },
    },
  });
  if (!ticket) return { error: "Ticket not found." };
  if (isReadyForPickup(ticket.status)) {
    return { error: "This ticket is already marked ready for pickup." };
  }

  const [shop, canned] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
    db.cannedResponse.findFirst({
      where: { shopId, title: PICKUP_CANNED_TITLE },
      select: { body: true },
    }),
  ]);

  // First use writes the default into the shop's own canned responses, so the
  // next edit of this message happens in Settings rather than in a code change.
  let template = canned?.body;
  if (!template) {
    await db.cannedResponse.create({
      data: { shopId, title: PICKUP_CANNED_TITLE, body: PICKUP_CANNED_BODY },
    });
    template = PICKUP_CANNED_BODY;
    revalidatePath("/settings");
  }

  const message = fillPickupTokens(template, {
    customer: ticket.customer.firstName,
    ticket: `#${ticket.number}`,
    shop: shop?.name ?? "the shop",
  });

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: READY_FOR_PICKUP_STATUS,
        // Ready for Pickup is not the terminal state — clear any stale stamp a
        // previously-resolved-then-reopened ticket is carrying.
        resolvedAt: null,
      },
    });

    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: ticket.id,
        authorId: userId,
        body: message,
        isPublic: true,
        subject: `Ticket #${ticket.number} is ready for pickup`,
        updateType: READY_FOR_PICKUP_STATUS,
        channel: "NOTE",
      },
    });
  });

  // A text when the customer asked for texts and we have a mobile; otherwise
  // email. Not both — this is one notice, and lib/comms files the single outbox
  // row either way, including when it has to skip.
  const useSms = ticket.customer.smsOptIn && Boolean(ticket.customer.mobile);
  const portalPath = `/portal/tickets/${ticket.id}`;

  if (useSms) {
    await sendSms({
      shopId,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      body: message,
      portalPath,
    });
  } else {
    await sendEmail({
      shopId,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      subject: `Ticket #${ticket.number} is ready for pickup`,
      body: message,
      context: `Ticket #${ticket.number} · ${ticket.subject}`,
      portalPath,
    });
  }

  revalidateTicket(ticket.id);
  return { ok: true };
}

/**
 * "Mark picked up" — the device left the building.
 *
 * Stamps `pickedUpAt`, closes the ticket, and by doing so QUEUES the review
 * request: lib/jobs/reviews.ts looks for exactly this shape (a pickup stamp
 * older than the shop's delay, with no `reviewRequestedAt`). Nothing is sent
 * here — asking for a review while the customer is still at the counter is the
 * fastest way to not get one.
 */
export async function markPickedUpAction(ticketId: string): Promise<ActionState> {
  const { shopId, userId } = await requireUser();

  const ticket = await findTicket(shopId, ticketId);
  if (!ticket) return { error: "Ticket not found." };

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        pickedUpAt: now,
        status: RESOLVED_STATUS,
        resolvedAt: now,
      },
    });

    const collected = await tx.ticket.findFirst({ where: { id: ticket.id, shopId }, select: { assetId: true } });
    if (collected?.assetId) {
      const others = await tx.ticket.count({ where: { shopId, assetId: collected.assetId, id: { not: ticket.id }, status: { not: RESOLVED_STATUS }, pickedUpAt: null } });
      if (others === 0) await tx.asset.updateMany({ where: { id: collected.assetId, shopId }, data: { password: null } });
    }

    await tx.ticketComment.create({
      data: {
        shopId,
        ticketId: ticket.id,
        authorId: userId,
        body: "Device collected by the customer.",
        isPublic: false,
        updateType: RESOLVED_STATUS,
        channel: "NOTE",
      },
    });
  });

  revalidateTicket(ticket.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk — the same moves, applied to a selection
// ---------------------------------------------------------------------------

/**
 * THE THREE RULES EVERY ACTION BELOW OBEYS
 * ----------------------------------------
 *   1. `shopId` comes from the session and rides in EVERY `where`. An id list
 *      that arrived over the wire is a list of guesses; the tenant filter is
 *      what turns a foreign guess into zero affected rows instead of a leak.
 *   2. The role check is the one the single-record path uses. Assigning and
 *      moving a status are both `requireUser()` here because
 *      `updateTicketAction` and `postUpdateAction` are — a bulk endpoint that
 *      is more permissive than its single-record twin is a privilege
 *      escalation with a nicer button.
 *   3. The list is validated before a query is built (see lib/bulk.ts). An
 *      empty selection writes nothing at all rather than degenerating into an
 *      unfiltered `updateMany`.
 *
 * They also emit what the single path emits. A status moved in bulk writes the
 * same timeline comment and fires the same webhook as one moved on its own —
 * a history with a hole in it where the batch went is worse than no history.
 */

/** Invalidates the list and every ticket page, without N calls for N ids. */
function revalidateTicketList(): void {
  revalidatePath("/tickets");
  revalidatePath("/tickets/[id]", "page");
}

/**
 * Hands a selection of tickets to one technician — or to nobody.
 *
 * `assigneeId` is re-resolved against this shop's active roster before it is
 * written, so a posted user id from another tenant is refused outright rather
 * than quietly writing a foreign key across the tenant boundary. An explicit
 * null is the "Unassign" case and is the only way to clear it.
 */
export async function bulkAssignTicketsAction(
  ticketIds: string[],
  assigneeId: string | null,
): Promise<BulkResult> {
  const { shopId } = await requireUser();

  const parsed = bulkIds(ticketIds);
  if (!parsed.ok) return parsed;

  // An unresolvable id is an ERROR, never a silent unassign: "assign these
  // nine to Marcus" must not quietly mean "clear the tech on these nine".
  let assignee: { id: string; name: string } | null = null;
  if (assigneeId !== null) {
    assignee = await db.user.findFirst({
      where: { id: assigneeId, shopId, active: true },
      select: { id: true, name: true },
    });
    if (!assignee) return { ok: false, error: "That technician is not on this team." };
  }

  const { count } = await db.ticket.updateMany({
    where: { id: { in: parsed.ids }, shopId },
    data: { assignedToId: assignee?.id ?? null },
  });

  revalidateTicketList();

  return {
    ok: true,
    count,
    message: assignee
      ? `${plural(count, "ticket")} assigned to ${assignee.name}`
      : `${plural(count, "ticket")} unassigned`,
  };
}

/**
 * Moves a selection of tickets to one status.
 *
 * Mirrors `postUpdateAction` exactly, minus the composer: the resolution stamp
 * follows the status in and out, every moved ticket gets its own timeline
 * comment, and every moved ticket fires its own webhook. Tickets already IN the
 * target status are left alone rather than re-stamped — otherwise "mark these
 * twelve Ready" would rewrite `resolvedAt` and post twelve identical notes on
 * the three that were already there.
 */
export async function bulkTicketStatusAction(
  ticketIds: string[],
  status: string,
): Promise<BulkResult> {
  const { shopId, userId } = await requireUser();

  const parsed = bulkIds(ticketIds);
  if (!parsed.ok) return parsed;

  // The shop's own list, not the client's word for it — a status is a free
  // string column, so an unchecked value would write anything at all into it.
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });
  const allowed = ticketStatuses(shop?.settings);
  const next = allowed.find((candidate) => candidate === status);
  if (!next) return { ok: false, error: "That is not one of this shop's statuses." };

  const targets = await db.ticket.findMany({
    where: { id: { in: parsed.ids }, shopId },
    select: { id: true, status: true },
  });
  const moving = targets.filter((ticket) => ticket.status !== next).map((t) => t.id);

  if (moving.length === 0) {
    return { ok: true, count: 0, message: `Already ${next}` };
  }

  const resolvedAt = isResolved(next) ? new Date() : null;

  await db.$transaction(async (tx) => {
    await tx.ticket.updateMany({
      // Scoped again inside the transaction. The ids came from a scoped read a
      // moment ago, but the filter costs nothing and means this statement is
      // safe read in isolation.
      where: { id: { in: moving }, shopId },
      data: { status: next, resolvedAt },
    });

    await tx.ticketComment.createMany({
      data: moving.map((ticketId) => ({
        shopId,
        ticketId,
        authorId: userId,
        body: `Status changed to ${next}.`,
        isPublic: false,
        updateType: next,
        channel: "NOTE" as const,
      })),
    });
  });

  // After the commit, never inside it — see the note on postUpdateAction.
  for (const ticketId of moving) {
    await emitTicketEvent(shopId, "ticket.status_changed", ticketId);
    if (resolvedAt) await emitTicketEvent(shopId, "ticket.resolved", ticketId);
  }

  revalidateTicketList();

  return {
    ok: true,
    count: moving.length,
    message: `${plural(moving.length, "ticket")} moved to ${next}`,
  };
}
