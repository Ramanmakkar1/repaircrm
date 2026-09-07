"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type {
  ConvertResult,
  LeadActionResult,
  LeadFormState,
} from "@/components/leads/lead-state";
import { splitName, ticketSubjectFromLead } from "@/components/leads/lead-meta";
import { requireRole, requireUser } from "@/lib/auth";
import { bulkIds, plural, type BulkResult } from "@/lib/bulk";
import { db } from "@/lib/db";
import { emitLeadEvent } from "@/lib/events";
import { newRecordLocationId } from "@/lib/location";
import { slaDueDate } from "@/lib/sla";
import { withNextNumber } from "@/lib/sequence";

/**
 * Server actions for the Leads inbox.
 *
 * MULTI-TENANCY: every action resolves `shopId` from the session and scopes the
 * target row by it. A lead id, a customer id and a ticket id all arrive over the
 * wire, and all three are re-checked against the session's shop before use —
 * see the contract in lib/db.ts.
 */

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Radix Select can't hold an empty string, so "none" is the null sentinel. */
const NONE = "none";

function text(fd: FormData, key: string): string | undefined {
  const raw = fd.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" || trimmed === NONE ? undefined : trimmed;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

function revalidateLead(leadId?: string) {
  revalidatePath("/leads");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const leadSchema = z.object({
  name: z.string().min(1, "A name is required").max(120),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().max(40).optional(),
  source: z.string().max(60).optional(),
  message: z.string().max(5000).optional(),
});

function readLead(fd: FormData) {
  return {
    name: text(fd, "name") ?? "",
    email: text(fd, "email")?.toLowerCase(),
    phone: text(fd, "phone"),
    source: text(fd, "source"),
    message: text(fd, "message"),
  };
}

/**
 * Explicit nulls for every optional column — on update, `undefined` means
 * "leave unchanged" in Prisma, which would make clearing a field impossible.
 */
function leadData(input: z.infer<typeof leadSchema>) {
  return {
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: input.source ?? null,
    message: input.message ?? null,
  };
}

export async function createLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { shopId } = await requireUser();

  const parsed = leadSchema.safeParse(readLead(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const lead = await db.lead.create({
    data: { ...leadData(parsed.data), shopId },
    select: { id: true },
  });

  await emitLeadEvent(shopId, "lead.created", lead.id);

  revalidateLead(lead.id);
  // redirect() throws to unwind — never put it inside a try/catch.
  redirect(`/leads/${lead.id}`);
}

export async function updateLeadAction(
  leadId: string,
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const { shopId } = await requireUser();

  const parsed = leadSchema.safeParse(readLead(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const updated = await db.lead.updateMany({
    where: { id: leadId, shopId },
    data: leadData(parsed.data),
  });
  if (updated.count === 0) return { error: "Lead not found." };

  revalidateLead(leadId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Status moves
// ---------------------------------------------------------------------------

/** "We called them back." Only moves a lead that is still open. */
export async function markContactedAction(
  leadId: string,
): Promise<LeadActionResult> {
  const { shopId } = await requireUser();

  const updated = await db.lead.updateMany({
    where: { id: leadId, shopId, status: { in: ["NEW", "CONTACTED"] } },
    data: { status: "CONTACTED" },
  });
  if (updated.count === 0) {
    return { ok: false, error: "That lead is no longer open." };
  }

  revalidateLead(leadId);
  return { ok: true };
}

/**
 * Closes a dead lead. An optional reason is APPENDED to the message rather than
 * replacing it — the customer's own words are the most useful thing on the row,
 * and overwriting them to record "no answer" would be a bad trade.
 */
export async function closeLeadAction(
  leadId: string,
  reason: string,
): Promise<LeadActionResult> {
  const { shopId } = await requireUser();

  const lead = await db.lead.findFirst({
    where: { id: leadId, shopId },
    select: { id: true, message: true, status: true },
  });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === "CONVERTED") {
    return { ok: false, error: "A converted lead can't be closed." };
  }

  const note = reason.trim().slice(0, 500);
  const message = note
    ? [lead.message, `Closed: ${note}`].filter(Boolean).join("\n\n")
    : lead.message;

  await db.lead.update({
    where: { id: lead.id },
    data: { status: "CLOSED", message },
  });

  revalidateLead(leadId);
  return { ok: true };
}

/** Puts a closed lead back in the inbox. */
export async function reopenLeadAction(leadId: string): Promise<LeadActionResult> {
  const { shopId } = await requireUser();

  const updated = await db.lead.updateMany({
    where: { id: leadId, shopId, status: "CLOSED" },
    data: { status: "NEW" },
  });
  if (updated.count === 0) return { ok: false, error: "Lead not found." };

  revalidateLead(leadId);
  return { ok: true };
}

/** OWNER only — a lead is the only record of an enquiry that never landed. */
export async function deleteLeadAction(leadId: string): Promise<LeadActionResult> {
  const { shopId } = await requireRole("OWNER");

  /*
    Prisma reads `id: undefined` as "no filter", so `deleteMany({ where: { id,
    shopId } })` with a missing id does not delete nothing — it deletes the
    SHOP'S ENTIRE TABLE. This codebase has already been bitten by exactly that
    shape once (canned responses), which is why the guard is spelled out at
    every call site rather than assumed at the caller.
  */
  if (typeof leadId !== "string" || !leadId) {
    return { ok: false, error: "Lead not found." };
  }

  const deleted = await db.lead.deleteMany({ where: { id: leadId, shopId } });
  if (deleted.count === 0) return { ok: false, error: "Lead not found." };

  revalidatePath("/leads");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convert — the money flow
// ---------------------------------------------------------------------------

const convertSchema = z.object({
  /** "link" reuses an existing customer, "create" makes one from the lead. */
  mode: z.enum(["link", "create"]),
  customerId: z.string().optional(),
  createTicket: z.boolean(),
  ticketSubject: z.string().max(200).optional(),
  ticketProblemType: z.string().max(60).optional(),
});

/**
 * Turns an enquiry into real records:
 *
 *   1. resolve the Customer — an existing one the operator picked, or a new one
 *      built from the lead's own fields;
 *   2. optionally open a Ticket for them, numbered through the same
 *      `withNextNumber` sequence every other ticket uses, with the same
 *      "Ticket created." opening comment;
 *   3. stamp the lead CONVERTED and hang both ids off it.
 *
 * The lead update goes LAST on purpose. If step 2 fails the lead is still open
 * and can be converted again, which is recoverable; a lead marked converted with
 * no ticket behind it is not.
 *
 * This deliberately mirrors `createTicketAction` rather than importing it — that
 * action is shaped for `useActionState` and redirects on success, neither of
 * which suits a dialog that has to report back what it made.
 */
export async function convertLeadAction(
  leadId: string,
  formData: FormData,
): Promise<ConvertResult> {
  const { shopId, userId } = await requireUser();

  const parsed = convertSchema.safeParse({
    mode: formData.get("mode"),
    customerId: text(formData, "customerId"),
    createTicket: formData.get("createTicket") === "on",
    ticketSubject: text(formData, "ticketSubject"),
    ticketProblemType: text(formData, "ticketProblemType"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const lead = await db.lead.findFirst({
    where: { id: leadId, shopId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      message: true,
      status: true,
    },
  });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === "CONVERTED") {
    return { ok: false, error: "This lead has already been converted." };
  }

  // --------------------------------------------------------------- customer --
  let customerId: string;

  if (input.mode === "link") {
    if (!input.customerId) {
      return { ok: false, error: "Pick the customer to link this lead to." };
    }
    const existing = await db.customer.findFirst({
      where: { id: input.customerId, shopId },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "That customer no longer exists." };
    customerId = existing.id;
  } else {
    const { firstName, lastName } = splitName(lead.name);
    const created = await db.customer.create({
      data: {
        shopId,
        firstName,
        lastName,
        email: lead.email,
        phone: lead.phone,
        // The lead only ever captured one number and we can't tell a mobile
        // from a landline, so it stays in `phone`. Texting requires `mobile`
        // plus an opt-in, and neither is ours to assume.
        notes: lead.message ? `From lead: ${lead.message}` : null,
        referredBy: null,
      },
      select: { id: true },
    });
    customerId = created.id;
  }

  // ----------------------------------------------------------------- ticket --
  let ticketId: string | null = null;

  if (input.createTicket) {
    const subject = input.ticketSubject || ticketSubjectFromLead(lead);
    const problemType = input.ticketProblemType || "Other";

    const locationId = await newRecordLocationId(shopId, userId);

    // Same rule as the intake form: no date given, so the shop's response
    // target for this priority sets one.
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      select: { settings: true },
    });

    const ticket = await withNextNumber(shopId, "ticket", (number) =>
      db.ticket.create({
        data: {
          shopId,
          number,
          customerId,
          locationId,
          subject,
          problemType,
          status: "New",
          priority: "NORMAL",
          dueDate: slaDueDate(shop?.settings, "NORMAL"),
          diagnosticNotes: lead.message ?? null,
          comments: {
            create: {
              shopId,
              authorId: userId,
              body: "Ticket created from a lead.",
              isPublic: false,
              updateType: "Created",
              channel: "NOTE",
            },
          },
        },
        select: { id: true },
      }),
    );
    ticketId = ticket.id;
  }

  await db.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", customerId, ticketId },
  });

  revalidateLead(leadId);
  revalidatePath("/customers");
  if (ticketId) revalidatePath("/tickets");

  return { ok: true, customerId, ticketId };
}

// ---------------------------------------------------------------------------
// Bulk — the same moves, applied to a selection
// ---------------------------------------------------------------------------

/**
 * The statuses a batch may be moved to.
 *
 * CONVERTED is absent and must stay absent. Converting is not a status change —
 * it creates a Customer, optionally opens a numbered Ticket, and hangs both ids
 * off the lead (see `convertLeadAction`). Writing the word CONVERTED onto forty
 * rows would claim all of that happened when none of it did.
 *
 * There is no `archived` column on Lead, and this does not invent one. CLOSED
 * is the only end state, and it is called "closed" everywhere it is visible:
 * the tab, the status pill, `closeLeadAction`, the single-lead "Close" button
 * and the bulk bar's "Close" button, which lands here with "CLOSED".
 */
const BULK_LEAD_STATUSES = ["NEW", "CONTACTED", "CLOSED"] as const;

/**
 * Moves a selection of leads to one status.
 *
 * `requireUser()`, matching `markContactedAction` / `closeLeadAction` /
 * `reopenLeadAction` — every single-lead status move is open to any signed-in
 * member of the shop, and a bulk endpoint must not be more permissive than the
 * one-at-a-time path it stands in for. (Deleting a lead is still OWNER-only and
 * has no bulk twin.)
 *
 * Three things ride in the `where`, and all three matter: `shopId` from the
 * session so a forged id from another tenant matches nothing, the id list
 * itself, and `status: { not: CONVERTED }` so a lead that already became a
 * customer and a ticket cannot be dragged back into the inbox. `updateMany`
 * doubles as the ownership check — a foreign id contributes zero to the count.
 *
 * Neither the single-lead path nor this one writes an audit row or emits an
 * event: `lead.created` is the only lead event the catalogue has, so there is
 * nothing here for a bulk move to skip.
 */
export async function bulkLeadStatusAction(
  leadIds: string[],
  status: string,
): Promise<BulkResult> {
  const { shopId } = await requireUser();

  const parsed = bulkIds(leadIds);
  if (!parsed.ok) return parsed;

  const next = BULK_LEAD_STATUSES.find((candidate) => candidate === status);
  if (!next) return { ok: false, error: "That is not a status a batch can be moved to." };

  const { count } = await db.lead.updateMany({
    where: { id: { in: parsed.ids }, shopId, status: { not: "CONVERTED" } },
    data: { status: next },
  });

  revalidatePath("/leads");
  revalidatePath("/leads/[id]", "page");

  if (count === 0) {
    return { ok: false, error: "Nothing moved — those leads are already converted." };
  }

  const moved = plural(count, "lead");
  return {
    ok: true,
    count,
    message:
      next === "CLOSED"
        ? `${moved} closed`
        : `${moved} moved to ${next === "NEW" ? "New" : "Contacted"}`,
  };
}
