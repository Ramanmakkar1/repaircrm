"use server";

/**
 * The inventory assistant's server surface.
 *
 * `runAssistantAction` interprets a natural-language command (any language) into
 * one typed intent (lib/ai/assistant.ts) and then decides what to do with it:
 *
 *   - safe intents (add / search) run immediately and report back,
 *   - a remove is STAGED — it comes back as `confirm`, and only
 *     `confirmRemoveProductAction` actually hides the product, so a misheard
 *     "delete it" can never remove anything on its own,
 *   - `refuse` / `clarify` just carry the assistant's message through.
 *
 * Like every action here, the session is re-read on each call and every query is
 * scoped to the session's shop — a productId that comes back over the wire for
 * the confirm step is only ever acted on after a `findFirst({ id, shopId })`
 * proves this shop owns it.
 */

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { z } from "zod";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { consumeAiQuota } from "@/lib/ai/quota";
import { db } from "@/lib/db";
import { emitCustomerEvent } from "@/lib/events";
import { formatCents, invoiceTotals } from "@/lib/money";
import {
  interpretCommand,
  type AssistantContext,
  type AssistantIntent,
} from "@/lib/ai/assistant";
import { RESOLVED_STATUS, ticketStatuses } from "@/components/tickets/ticket-meta";
import {
  adjustStockAction,
  quickAddProductAction,
} from "@/app/(app)/inventory/actions";
import {
  bulkTicketStatusAction,
  notifyReadyForPickupAction,
  postUpdateAction,
} from "@/app/(app)/tickets/actions";

/** A tappable result: a repair, a customer, an invoice, a screen. */
export type AssistantLink = { label: string; href: string; detail?: string };

/**
 * A write the assistant has worked out but NOT done. It travels to the browser
 * and comes back on the confirm tap, so it is treated as untrusted on the way
 * back in: `confirmAssistantAction` re-validates the shape and every id is
 * re-resolved against the session's shop before anything is written.
 */
export type PendingAction =
  | { type: "set_price"; productId: string; priceCents: number }
  | { type: "set_ticket_status"; ticketId: string; status: string }
  | { type: "add_ticket_note"; ticketId: string; note: string }
  | { type: "notify_ready"; ticketId: string }
  | { type: "create_customer"; name: string; phone: string | null; email: string | null };

export type AssistantOutcome =
  | { kind: "done"; message: string; links?: AssistantLink[] }
  | { kind: "info"; message: string; continuation?: string; links?: AssistantLink[] }
  | {
      kind: "confirm";
      message: string;
      remove: { productId: string; name: string };
    }
  | {
      kind: "confirm";
      message: string;
      pending: PendingAction;
      /** The words on the button: "Set price", "Send message". */
      confirmLabel: string;
    }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

type AddProductIntent = Extract<AssistantIntent, { action: "add_product" }>;

/** What the browser may tell us about where the user is and what they said before. */
export type AssistantClientContext = { path?: string; history?: string[] };

export async function runAssistantAction(
  text: string,
  client?: AssistantClientContext,
): Promise<AssistantOutcome> {
  const { shopId, userId, role } = await requireUser();

  if (!text.trim()) return { kind: "error", message: "Say or type a command first." };
  const quota = await consumeAiQuota(shopId, "text");
  if (!quota.ok) return { kind: "error", message: quota.reason };

  const context = await loadContext(shopId, client);
  const interpreted = await interpretCommand(text, context);
  if (!interpreted.ok) return { kind: "error", message: interpreted.reason };

  const outcome = await dispatch(interpreted.intent, text, { shopId, userId, role }, context);
  // A "which one?" question keeps the original request alive, so the short
  // answer that follows is read in its light (see `ambiguous`).
  return outcome.kind === "info" && outcome.continuation === ASK_AGAIN
    ? { ...outcome, continuation: text }
    : outcome;
}

/** Marks an outcome whose follow-up answer should continue the same request. */
const ASK_AGAIN = "\u0000ask-again";

async function dispatch(
  intent: AssistantIntent,
  text: string,
  { shopId, userId, role }: { shopId: string; userId: string; role: string },
  context: AssistantContext,
): Promise<AssistantOutcome> {
  switch (intent.action) {
    case "refuse":
      return { kind: "refused", message: intent.message };
    case "clarify":
      // Keep the original request with the clarification. The next short
      // answer ("10", "$89", or a product name) must be interpreted in that
      // context instead of being sent to the model as a brand-new command.
      return { kind: "info", message: intent.message, continuation: text };
    case "search_products":
      return searchProducts(shopId, intent.query);
    case "add_product":
      return addProduct(shopId, intent);
    case "adjust_stock":
      return changeStock(shopId, intent.product, "delta", intent.amount);
    case "set_stock":
      return changeStock(shopId, intent.product, "count", intent.count);
    case "set_price":
      return setPrice(shopId, intent.product, intent.price);
    case "low_stock":
      return lowStock(shopId);
    case "find_tickets":
      return findTickets(shopId, userId, intent);
    case "find_customers":
      return findCustomers(shopId, intent.query);
    case "find_invoices":
      return role === "TECH" ? noMoney() : findInvoices(shopId, intent);
    case "sales_summary":
      return role === "TECH" ? noMoney() : salesSummary(shopId, intent.period);
    case "appointments":
      return listAppointments(shopId, intent.day);
    case "open_page":
      return openPage(shopId, role, intent.page, intent.customer ?? null);
    case "set_ticket_status":
      return stageTicketStatus(shopId, intent.ticket, intent.status, context.statuses ?? []);
    case "add_ticket_note":
      return stageTicketNote(shopId, intent.ticket, intent.note);
    case "notify_ready":
      return stageNotifyReady(shopId, intent.ticket);
    case "create_customer":
      return stageCreateCustomer(shopId, intent);
    case "remove_product":
      return stageRemove(shopId, intent.product);
  }
}

/**
 * Server-side context for the model. The ticket on screen is looked up by id
 * WITH the shop filter, so a path naming another shop's ticket resolves to
 * nothing rather than leaking its number.
 */
async function loadContext(
  shopId: string,
  client?: AssistantClientContext,
): Promise<AssistantContext> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });

  let currentTicketNumber: number | null = null;
  const ticketId = typeof client?.path === "string"
    ? client.path.match(/^\/tickets\/([a-z0-9]{10,40})(?:\/|$)/i)?.[1]
    : undefined;
  if (ticketId && ticketId !== "new") {
    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, shopId },
      select: { number: true },
    });
    currentTicketNumber = ticket?.number ?? null;
  }

  return {
    statuses: ticketStatuses(shop?.settings),
    currentTicketNumber,
    history: Array.isArray(client?.history)
      ? client.history.filter((entry): entry is string => typeof entry === "string").slice(-3)
      : [],
    today: new Date().toDateString(),
  };
}

function noMoney(): AssistantOutcome {
  return {
    kind: "refused",
    message: "Money figures are for the owner and front desk — ask them, or check with your manager.",
  };
}

const pendingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_price"),
    productId: z.string().min(1).max(64),
    priceCents: z.number().int().min(0).max(10_000_000),
  }),
  z.object({
    type: z.literal("set_ticket_status"),
    ticketId: z.string().min(1).max(64),
    status: z.string().min(1).max(60),
  }),
  z.object({
    type: z.literal("add_ticket_note"),
    ticketId: z.string().min(1).max(64),
    note: z.string().min(1).max(1000),
  }),
  z.object({ type: z.literal("notify_ready"), ticketId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal("create_customer"),
    name: z.string().min(1).max(120),
    phone: z.string().max(40).nullable(),
    email: z.string().max(200).nullable(),
  }),
]);

/**
 * Runs a staged write after the user pressed its confirm button.
 *
 * The payload crossed the network twice, so nothing in it is believed: the
 * shape is re-parsed (a missing id can never reach Prisma as `undefined` and
 * widen a `where` to the whole shop), and every id is re-resolved with the
 * session's shopId — either here or inside the ticket action it is handed to,
 * each of which does its own scoped lookup.
 */
export async function confirmAssistantAction(input: unknown): Promise<AssistantOutcome> {
  const { shopId, userId } = await requireUser();

  const parsed = pendingSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "error", message: "That request expired — ask me again." };
  }
  const pending = parsed.data;

  switch (pending.type) {
    case "set_price": {
      const product = await db.product.findFirst({
        where: { id: pending.productId, shopId },
        select: { id: true, name: true, priceCents: true },
      });
      if (!product) return { kind: "error", message: "That product no longer exists." };

      await db.product.update({
        where: { id: product.id },
        data: { priceCents: pending.priceCents },
      });
      await audit({
        shopId,
        userId,
        action: "product.price_changed",
        entity: "product",
        entityId: product.id,
        summary: `${product.name}: ${formatCents(product.priceCents)} → ${formatCents(pending.priceCents)} (assistant)`,
        meta: { fromCents: product.priceCents, toCents: pending.priceCents, via: "assistant" },
      });
      revalidatePath("/inventory");
      revalidatePath(`/inventory/${product.id}`);
      return {
        kind: "done",
        message: `“${product.name}” is now ${formatCents(pending.priceCents)} (was ${formatCents(product.priceCents)}).`,
        links: [{ label: product.name, href: `/inventory/${product.id}`, detail: "Open product" }],
      };
    }

    case "set_ticket_status": {
      const ticket = await scopedTicket(shopId, pending.ticketId);
      if (!ticket) return { kind: "error", message: "That repair no longer exists." };
      const result = await bulkTicketStatusAction([ticket.id], pending.status);
      if (!result.ok) return { kind: "error", message: result.error };
      return {
        kind: "done",
        message: `Repair #${ticket.number} is now ${pending.status}.`,
        links: [ticketLink(ticket)],
      };
    }

    case "add_ticket_note": {
      const ticket = await scopedTicket(shopId, pending.ticketId);
      if (!ticket) return { kind: "error", message: "That repair no longer exists." };
      const form = new FormData();
      form.set("body", pending.note);
      // Never public from here: a customer-facing message is written and read
      // by a person on the ticket screen, not dictated across a noisy counter.
      const result = await postUpdateAction(ticket.id, {}, form);
      if (result?.error) return { kind: "error", message: result.error };
      return {
        kind: "done",
        message: `Note added to repair #${ticket.number} (staff only).`,
        links: [ticketLink(ticket)],
      };
    }

    case "notify_ready": {
      const ticket = await scopedTicket(shopId, pending.ticketId);
      if (!ticket) return { kind: "error", message: "That repair no longer exists." };
      const result = await notifyReadyForPickupAction(ticket.id);
      if (result?.error) return { kind: "error", message: result.error };
      return {
        // Marked ready either way; a notice means the customer does NOT know yet.
        kind: result.notice ? "info" : "done",
        message: `Repair #${ticket.number}: ${result.notice ?? result.done ?? "marked ready for pickup."}`,
        links: [ticketLink(ticket)],
      };
    }

    case "create_customer": {
      const { firstName, lastName } = splitName(pending.name);
      const customer = await db.customer.create({
        data: {
          shopId,
          firstName,
          lastName,
          mobile: pending.phone?.trim() || null,
          email: pending.email?.trim().toLowerCase() || null,
        },
        select: { id: true },
      });
      await emitCustomerEvent(shopId, "customer.created", customer.id);
      revalidatePath("/customers");
      return {
        kind: "done",
        message: `Added ${pending.name} as a customer.`,
        links: [
          { label: pending.name, href: `/customers/${customer.id}`, detail: "Open customer" },
          {
            label: `Check in a device for ${firstName}`,
            href: `/tickets/new?customerId=${customer.id}`,
            detail: "New ticket",
          },
        ],
      };
    }
  }
}

/**
 * Executes a staged removal after the user confirmed it.
 *
 * "Remove" is a DEACTIVATE, not a hard delete: the product is hidden from sale
 * but kept on every invoice, PO and ticket that already references it, so
 * removing something never rewrites financial history. It's reversible from the
 * product page.
 */
export async function confirmRemoveProductAction(
  productId: string,
): Promise<AssistantOutcome> {
  const { shopId } = await requireUser();

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, name: true },
  });
  if (!product) return { kind: "error", message: "That product no longer exists." };

  await db.product.update({ where: { id: product.id }, data: { active: false } });

  revalidatePath("/inventory");
  return {
    kind: "done",
    message: `Removed “${product.name}” — hidden from sale, kept on past invoices.`,
  };
}

// ---------------------------------------------------------------------------

async function addProduct(
  shopId: string,
  intent: AddProductIntent,
): Promise<AssistantOutcome> {
  // Don't silently make a second "iPhone 6 Screen" — point at the existing one.
  const existing = await db.product.findFirst({
    where: { shopId, name: { equals: intent.name, mode: "insensitive" } },
    select: { name: true },
  });
  if (existing) {
    const hint =
      intent.quantity != null
        ? `add ${intent.quantity} to ${existing.name}`
        : `add stock to ${existing.name}`;
    return {
      kind: "info",
      message: `“${existing.name}” already exists — say “${hint}” to restock it.`,
    };
  }

  const formData = new FormData();
  formData.set("name", intent.name);
  if (intent.price != null) formData.set("price", String(intent.price));
  if (intent.quantity != null) formData.set("stockQty", String(intent.quantity));
  if (intent.category) formData.set("category", intent.category);

  // Reuse Quick Add so the assistant gets the same auto-SKU and validation.
  const result = await quickAddProductAction(undefined, formData);
  if (result?.ok) {
    const qty = intent.quantity ?? 0;
    const stockNote = qty > 0 ? `, ${qty} in stock` : "";
    return { kind: "done", message: `Added ${result.name} · ${result.sku}${stockNote}.` };
  }

  const message = result?.fieldErrors
    ? Object.values(result.fieldErrors)[0]
    : result?.error;
  return { kind: "error", message: message ?? "Couldn't add that product." };
}

async function searchProducts(
  shopId: string,
  query: string,
): Promise<AssistantOutcome> {
  const products = await db.product.findMany({
    where: nameWhere(shopId, query),
    take: 6,
    orderBy: { name: "asc" },
    select: { name: true, stockQty: true, priceCents: true, active: true },
  });

  if (products.length === 0) {
    return { kind: "info", message: `No products match “${query}”.` };
  }

  const lines = products.map(
    (product) =>
      `• ${product.name} — ${product.stockQty} in stock, ${formatCents(product.priceCents)}${
        product.active ? "" : " (inactive)"
      }`,
  );
  return {
    kind: "info",
    message: `Found ${products.length}:\n${lines.join("\n")}`,
  };
}

type ResolvedProduct = {
  id: string;
  name: string;
  serialized: boolean;
  stockQty: number;
};

type Resolution =
  | { kind: "none" }
  | { kind: "many"; names: string[] }
  | { kind: "one"; product: ResolvedProduct };

/** Finds the one active product a command names, or reports none / too many. */
async function resolveProduct(shopId: string, query: string): Promise<Resolution> {
  const matches = await db.product.findMany({
    where: { ...nameWhere(shopId, query), active: true },
    take: 6,
    orderBy: { name: "asc" },
    select: { id: true, name: true, serialized: true, stockQty: true },
  });
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) {
    return { kind: "many", names: matches.map((match) => match.name) };
  }
  return { kind: "one", product: matches[0] };
}

function noMatch(query: string): AssistantOutcome {
  return { kind: "info", message: `No active product matches “${query}”.` };
}

/**
 * ASK_AGAIN keeps the conversation going: the user's next short answer ("the
 * black one") is read as an answer to THIS question, not as a new command.
 */
function ambiguous(query: string, names: string[]): AssistantOutcome {
  const list = names.map((name) => `• ${name}`).join("\n");
  return {
    kind: "info",
    message: `More than one product matches “${query}” — which one?\n${list}`,
    continuation: ASK_AGAIN,
  };
}

async function stageRemove(
  shopId: string,
  query: string,
): Promise<AssistantOutcome> {
  const resolved = await resolveProduct(shopId, query);
  if (resolved.kind === "none") return noMatch(query);
  if (resolved.kind === "many") return ambiguous(query, resolved.names);

  const { id, name } = resolved.product;
  return {
    kind: "confirm",
    message: `Remove “${name}” from the catalogue? It’ll be hidden from sale but kept on past invoices.`,
    remove: { productId: id, name },
  };
}

/**
 * Restock (delta) or set (count) a product's stock through the audited
 * `adjustStockAction`, so the assistant's change lands in the same StockAdjustment
 * trail as one made by hand. A serialized product is refused here: its level is
 * its units, which are added by serial number, not by typing a number.
 */
async function changeStock(
  shopId: string,
  query: string,
  mode: "delta" | "count",
  amount: number,
): Promise<AssistantOutcome> {
  const resolved = await resolveProduct(shopId, query);
  if (resolved.kind === "none") return noMatch(query);
  if (resolved.kind === "many") return ambiguous(query, resolved.names);

  const product = resolved.product;
  if (product.serialized) {
    return {
      kind: "info",
      message: `“${product.name}” is tracked by serial number — add or remove units from its product page.`,
    };
  }
  if (mode === "count" && amount < 0) {
    return { kind: "error", message: "Stock can't be negative." };
  }
  if (mode === "delta" && amount === 0) {
    return { kind: "info", message: "That wouldn't change anything." };
  }
  if (mode === "delta" && product.stockQty + amount < 0) {
    return {
      kind: "error",
      message: `“${product.name}” only has ${product.stockQty} in stock — I can't take off ${Math.abs(amount)}.`,
    };
  }

  const formData = new FormData();
  formData.set("mode", mode);
  formData.set("amount", String(amount));
  formData.set("reason", mode === "count" ? "Counted" : amount > 0 ? "Received" : "Other");
  formData.set("note", "Added by assistant");

  const result = await adjustStockAction(product.id, {}, formData);
  if (!result.ok) {
    return { kind: "error", message: result.error ?? "Couldn't adjust that stock." };
  }

  const after = await db.product.findFirst({
    where: { id: product.id, shopId },
    select: { stockQty: true },
  });
  return {
    kind: "done",
    message: `Updated “${product.name}” — now ${after?.stockQty ?? 0} in stock.`,
  };
}

/**
 * Stages a price change. A price is money on the shelf for the rest of the day,
 * and "forty five" heard as "four point five" looks perfectly valid — so it is
 * shown as was → now and only written on the confirm tap, with an audit row.
 */
async function setPrice(
  shopId: string,
  query: string,
  price: number,
): Promise<AssistantOutcome> {
  const resolved = await resolveProduct(shopId, query);
  if (resolved.kind === "none") return noMatch(query);
  if (resolved.kind === "many") return ambiguous(query, resolved.names);

  const cents = Math.round(price * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 10_000_000) {
    return { kind: "error", message: "That price doesn't look right." };
  }

  const current = await db.product.findFirst({
    where: { id: resolved.product.id, shopId },
    select: { priceCents: true },
  });
  if (current?.priceCents === cents) {
    return { kind: "info", message: `“${resolved.product.name}” is already ${formatCents(cents)}.` };
  }

  return {
    kind: "confirm",
    message: `Change “${resolved.product.name}” from ${formatCents(current?.priceCents ?? 0)} to ${formatCents(cents)}?`,
    pending: { type: "set_price", productId: resolved.product.id, priceCents: cents },
    confirmLabel: `Set price to ${formatCents(cents)}`,
  };
}

/**
 * Products at or below their reorder point — the "what to buy" list. Mirrors the
 * Inventory low-stock view: the comparison sits on the nullable `lowStockAt`, so
 * a product with no reorder point (labour, services) drops out on its own.
 */
async function lowStock(shopId: string): Promise<AssistantOutcome> {
  const products = await db.product.findMany({
    where: {
      shopId,
      active: true,
      lowStockAt: { gte: db.product.fields.stockQty },
    },
    take: 12,
    orderBy: { name: "asc" },
    select: { name: true, stockQty: true, lowStockAt: true, reorderQty: true },
  });

  if (products.length === 0) {
    return {
      kind: "info",
      message: "Nothing is at or below its reorder point — you're well stocked.",
    };
  }

  const lines = products.map((product) => {
    // The same default the reorder flow uses: top back up to twice the point.
    const suggested =
      product.reorderQty ??
      Math.max(1, (product.lowStockAt ?? 0) * 2 - product.stockQty);
    return `• ${product.name} — ${product.stockQty} left (reorder ~${suggested})`;
  });
  return { kind: "info", message: `${products.length} to restock:\n${lines.join("\n")}` };
}

type FindTicketsIntent = Extract<AssistantIntent, { action: "find_tickets" }>;

/** Lists repair tickets — by status, customer, number, "mine" or "late". */
async function findTickets(
  shopId: string,
  userId: string,
  intent: FindTicketsIntent,
): Promise<AssistantOutcome> {
  const where: Prisma.TicketWhereInput = { shopId };
  if (intent.number) where.number = intent.number;
  if (intent.status) where.status = { contains: intent.status, mode: "insensitive" };
  if (intent.customer) where.customer = customerNameWhere(intent.customer);
  if (intent.mine) where.assignedToId = userId;
  if (intent.overdue) {
    where.dueDate = { lt: new Date() };
    where.NOT = { status: RESOLVED_STATUS };
  }
  // "My repairs" and "John's repairs" mean the live ones; a finished job only
  // shows when it was asked for by status or number.
  if (!intent.status && !intent.number && !intent.overdue) {
    where.NOT = { status: RESOLVED_STATUS };
  }

  const tickets = await db.ticket.findMany({
    where,
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      customer: {
        select: { firstName: true, lastName: true, businessName: true },
      },
    },
  });

  if (tickets.length === 0) return { kind: "info", message: "No matching repairs." };

  const lines = tickets.map(
    (ticket) =>
      `• #${ticket.number} · ${personName(ticket.customer)} · ${ticket.subject} — ${ticket.status}`,
  );
  return {
    kind: "info",
    message: `${tickets.length} repair${tickets.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
    links: tickets.map((ticket) => ({
      label: `#${ticket.number} · ${personName(ticket.customer)}`,
      href: `/tickets/${ticket.id}`,
      detail: `${ticket.subject} — ${ticket.status}`,
    })),
  };
}

function customerNameWhere(name: string): Prisma.CustomerWhereInput {
  // Every word must land somewhere, so "john smith" finds John Smith instead of
  // needing one column to contain the whole phrase.
  const tokens = name.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" as const } },
        { lastName: { contains: token, mode: "insensitive" as const } },
        { businessName: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}

async function findCustomers(shopId: string, query: string): Promise<AssistantOutcome> {
  const digits = query.replace(/\D/g, "");
  const looksLikePhone = digits.length >= 4 && digits.length >= query.replace(/\s/g, "").length - 3;
  const where: Prisma.CustomerWhereInput = looksLikePhone
    ? {
        shopId,
        OR: [
          { phone: { contains: digits.slice(-7) } },
          { mobile: { contains: digits.slice(-7) } },
          { phone: { contains: query.trim() } },
          { mobile: { contains: query.trim() } },
        ],
      }
    : query.includes("@")
      ? { shopId, email: { contains: query.trim(), mode: "insensitive" } }
      : { shopId, ...customerNameWhere(query) };

  const customers = await db.customer.findMany({
    where,
    take: 8,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      phone: true,
      mobile: true,
      email: true,
    },
  });
  if (customers.length === 0) {
    return {
      kind: "info",
      message: `Nobody matches “${query}”.`,
      links: [{ label: "Add a new customer", href: "/customers/new", detail: "Customers" }],
    };
  }

  return {
    kind: "info",
    message: `Found ${customers.length} customer${customers.length === 1 ? "" : "s"}:`,
    links: customers.map((customer) => ({
      label: personName(customer),
      href: `/customers/${customer.id}`,
      detail: [customer.mobile || customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details",
    })),
  };
}

type FindInvoicesIntent = Extract<AssistantIntent, { action: "find_invoices" }>;

async function findInvoices(
  shopId: string,
  intent: FindInvoicesIntent,
): Promise<AssistantOutcome> {
  const where: Prisma.InvoiceWhereInput = { shopId };
  if (intent.number) where.number = intent.number;
  if (intent.customer) where.customer = customerNameWhere(intent.customer);
  if (intent.unpaid) where.status = { in: ["SENT", "PARTIAL"] };

  const invoices = await db.invoice.findMany({
    where,
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      taxRateBps: true,
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      payments: { select: { amountCents: true } },
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });
  if (invoices.length === 0) {
    return {
      kind: "info",
      message: intent.unpaid ? "Nobody owes you anything right now." : "No matching invoices.",
    };
  }

  const rows = invoices
    .map((invoice) => ({
      invoice,
      totals: invoiceTotals(invoice.lines, invoice.taxRateBps, invoice.payments),
    }))
    // Status says "sent"; the arithmetic is what says "owes". An invoice that
    // was settled without its status catching up is not a debt to chase.
    .filter((row) => !intent.unpaid || row.totals.balanceCents > 0);
  if (rows.length === 0) {
    return { kind: "info", message: "Nobody owes you anything right now." };
  }
  const owed = rows.reduce((sum, row) => sum + Math.max(row.totals.balanceCents, 0), 0);

  return {
    kind: "info",
    message: intent.unpaid
      ? `${rows.length} unpaid invoice${rows.length === 1 ? "" : "s"} — ${formatCents(owed)} owing:`
      : `${rows.length} invoice${rows.length === 1 ? "" : "s"}:`,
    links: rows.map(({ invoice, totals }) => ({
      label: `Invoice #${invoice.number} · ${personName(invoice.customer)}`,
      href: `/invoices/${invoice.id}`,
      detail:
        totals.balanceCents > 0
          ? `${formatCents(totals.balanceCents)} owing of ${formatCents(totals.totalCents)}`
          : `${formatCents(totals.totalCents)} · ${invoice.status === "PAID" ? "Paid" : invoice.status.toLowerCase()}`,
    })),
  };
}

type SummaryPeriod = Extract<AssistantIntent, { action: "sales_summary" }>["period"];

const PERIOD_LABEL: Record<SummaryPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  this_month: "This month",
};

function periodRange(period: SummaryPeriod): { from: Date; to: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const to = new Date();
  if (period === "yesterday") {
    const from = new Date(start);
    from.setDate(from.getDate() - 1);
    return { from, to: start };
  }
  if (period === "this_week") {
    // Monday-based, which is how a shop talks about "this week".
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === "this_month") {
    start.setDate(1);
  }
  return { from: start, to };
}

/** Money in, refunds out, repairs opened and finished — the counter's scoreboard. */
async function salesSummary(shopId: string, period: SummaryPeriod): Promise<AssistantOutcome> {
  const { from, to } = periodRange(period);
  const window = { gte: from, lt: to };

  const [payments, refunds, opened, finished] = await Promise.all([
    db.payment.aggregate({
      where: { shopId, createdAt: window },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    db.refund.aggregate({ where: { shopId, createdAt: window }, _sum: { amountCents: true } }),
    db.ticket.count({ where: { shopId, createdAt: window } }),
    db.ticket.count({ where: { shopId, resolvedAt: window } }),
  ]);

  const taken = payments._sum.amountCents ?? 0;
  const refunded = refunds._sum.amountCents ?? 0;
  const lines = [
    `• ${formatCents(taken - refunded)} taken${refunded > 0 ? ` (after ${formatCents(refunded)} refunded)` : ""} across ${payments._count._all} payment${payments._count._all === 1 ? "" : "s"}`,
    `• ${opened} repair${opened === 1 ? "" : "s"} checked in`,
    `• ${finished} repair${finished === 1 ? "" : "s"} finished`,
  ];
  return {
    kind: "info",
    message: `${PERIOD_LABEL[period]}:\n${lines.join("\n")}`,
    links: [{ label: "Open reports", href: "/reports", detail: "Full breakdown" }],
  };
}

async function listAppointments(
  shopId: string,
  day: "today" | "tomorrow",
): Promise<AssistantOutcome> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (day === "tomorrow") from.setDate(from.getDate() + 1);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const rows = await db.appointment.findMany({
    where: { shopId, startsAt: { gte: from, lt: to }, status: { not: "CANCELED" } },
    orderBy: { startsAt: "asc" },
    take: 12,
    select: {
      id: true,
      title: true,
      startsAt: true,
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });
  if (rows.length === 0) {
    return {
      kind: "info",
      message: `Nobody is booked in ${day}.`,
      links: [{ label: "Open the calendar", href: "/appointments", detail: "Appointments" }],
    };
  }
  return {
    kind: "info",
    message: `${rows.length} booked ${day}:`,
    links: rows.map((row) => ({
      label: `${row.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${row.customer ? personName(row.customer) : row.title}`,
      href: "/appointments",
      detail: row.title,
    })),
  };
}

type AssistantPage = Extract<AssistantIntent, { action: "open_page" }>["page"];

/** The only URLs the assistant can ever hand out. */
const PAGES: Record<AssistantPage, { href: string; label: string; ownerOnly?: boolean }> = {
  dashboard: { href: "/dashboard", label: "Dashboard" },
  new_ticket: { href: "/tickets/new", label: "Check in a device" },
  new_customer: { href: "/customers/new", label: "Add a customer" },
  new_estimate: { href: "/estimates/new", label: "New estimate" },
  new_invoice: { href: "/invoices/new", label: "New invoice" },
  new_product: { href: "/inventory/new", label: "Add a product" },
  tickets: { href: "/tickets", label: "Tickets" },
  customers: { href: "/customers", label: "Customers" },
  estimates: { href: "/estimates", label: "Estimates" },
  invoices: { href: "/invoices", label: "Invoices" },
  pos: { href: "/pos", label: "Register (POS)" },
  inventory: { href: "/inventory", label: "Inventory" },
  purchase_orders: { href: "/inventory/purchase-orders", label: "Purchase orders", ownerOnly: true },
  appointments: { href: "/appointments", label: "Appointments" },
  leads: { href: "/leads", label: "Leads" },
  marketing: { href: "/marketing", label: "Marketing" },
  reports: { href: "/reports", label: "Reports" },
  time_clock: { href: "/time-clock", label: "Time clock" },
  shop_display: { href: "/display", label: "Shop display" },
  settings: { href: "/settings", label: "Settings" },
  settings_payments: { href: "/settings?tab=payments", label: "Payment settings", ownerOnly: true },
  settings_team: { href: "/settings?tab=team", label: "Team settings", ownerOnly: true },
  settings_taxes: { href: "/settings?tab=shop", label: "Tax rates (Shop details)", ownerOnly: true },
  settings_messaging: { href: "/settings?tab=messaging", label: "Messaging settings", ownerOnly: true },
  settings_saved_replies: { href: "/settings?tab=canned", label: "Saved replies" },
};

const CUSTOMER_PAGES: ReadonlySet<AssistantPage> = new Set([
  "new_ticket",
  "new_estimate",
  "new_invoice",
]);

/**
 * "Take me to…" and "start a…". Navigation is handed back as a link the user
 * taps: the assistant never moves the screen out from under a half-typed form.
 */
async function openPage(
  shopId: string,
  role: string,
  page: AssistantPage,
  customerName: string | null,
): Promise<AssistantOutcome> {
  const target = PAGES[page];
  if (target.ownerOnly && role !== "OWNER") {
    return { kind: "refused", message: `${target.label} is for the shop owner.` };
  }

  if (customerName && CUSTOMER_PAGES.has(page)) {
    const matches = await db.customer.findMany({
      where: { shopId, ...customerNameWhere(customerName) },
      take: 5,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, businessName: true, mobile: true, phone: true },
    });
    if (matches.length > 0) {
      return {
        kind: "info",
        message:
          matches.length === 1
            ? `${target.label} for ${personName(matches[0])}:`
            : `${matches.length} customers match “${customerName}” — pick one:`,
        links: matches.map((customer) => ({
          label: `${target.label} — ${personName(customer)}`,
          href: `${target.href}?customerId=${customer.id}`,
          detail: customer.mobile || customer.phone || undefined,
        })),
      };
    }
    return {
      kind: "info",
      message: `I couldn't find “${customerName}” — you can add them on the way in.`,
      links: [{ label: target.label, href: target.href, detail: "New customer" }],
    };
  }

  return {
    kind: "info",
    message: "Here you go:",
    links: [{ label: target.label, href: target.href }],
  };
}

// ---------------------------------------------------------------------------
// Staged writes — worked out here, run only by confirmAssistantAction
// ---------------------------------------------------------------------------

type ScopedTicket = { id: string; number: number; subject: string; status: string };

async function scopedTicket(shopId: string, ticketId: string): Promise<ScopedTicket | null> {
  return db.ticket.findFirst({
    where: { id: ticketId, shopId },
    select: { id: true, number: true, subject: true, status: true },
  });
}

async function ticketByNumber(shopId: string, number: number): Promise<ScopedTicket | null> {
  return db.ticket.findFirst({
    where: { shopId, number },
    select: { id: true, number: true, subject: true, status: true },
  });
}

function ticketLink(ticket: ScopedTicket): AssistantLink {
  return { label: `Repair #${ticket.number}`, href: `/tickets/${ticket.id}`, detail: ticket.subject };
}

function noTicket(number: number): AssistantOutcome {
  return { kind: "info", message: `I can't find repair #${number}.` };
}

async function stageTicketStatus(
  shopId: string,
  number: number,
  status: string,
  statuses: string[],
): Promise<AssistantOutcome> {
  const ticket = await ticketByNumber(shopId, number);
  if (!ticket) return noTicket(number);

  // The shop's own list decides, not the model's spelling of it.
  const wanted = status.trim().toLowerCase();
  const next =
    statuses.find((candidate) => candidate.toLowerCase() === wanted) ??
    statuses.find((candidate) => candidate.toLowerCase().includes(wanted));
  if (!next) {
    return {
      kind: "info",
      message: `“${status}” isn't one of your statuses. Yours are:\n${statuses.map((s) => `• ${s}`).join("\n")}`,
    };
  }
  if (next === ticket.status) {
    return { kind: "info", message: `Repair #${ticket.number} is already ${next}.`, links: [ticketLink(ticket)] };
  }

  return {
    kind: "confirm",
    message: `Move repair #${ticket.number} (${ticket.subject}) from ${ticket.status} to ${next}? The customer is not messaged.`,
    pending: { type: "set_ticket_status", ticketId: ticket.id, status: next },
    confirmLabel: `Move to ${next}`,
  };
}

async function stageTicketNote(
  shopId: string,
  number: number,
  note: string,
): Promise<AssistantOutcome> {
  const ticket = await ticketByNumber(shopId, number);
  if (!ticket) return noTicket(number);
  return {
    kind: "confirm",
    message: `Add this staff-only note to repair #${ticket.number} (${ticket.subject})?\n\n“${note}”`,
    pending: { type: "add_ticket_note", ticketId: ticket.id, note },
    confirmLabel: "Add note",
  };
}

async function stageNotifyReady(shopId: string, number: number): Promise<AssistantOutcome> {
  const ticket = await db.ticket.findFirst({
    where: { shopId, number },
    select: {
      id: true,
      number: true,
      subject: true,
      status: true,
      customer: { select: { firstName: true, lastName: true, businessName: true } },
    },
  });
  if (!ticket) return noTicket(number);
  return {
    kind: "confirm",
    message: `Tell ${personName(ticket.customer)} that repair #${ticket.number} (${ticket.subject}) is ready for pickup? This marks it ready and sends their pickup message.`,
    pending: { type: "notify_ready", ticketId: ticket.id },
    confirmLabel: "Send pickup message",
  };
}

type CreateCustomerIntent = Extract<AssistantIntent, { action: "create_customer" }>;

async function stageCreateCustomer(
  shopId: string,
  intent: CreateCustomerIntent,
): Promise<AssistantOutcome> {
  const name = intent.name.trim();
  const phone = intent.phone?.trim() || null;
  const email = intent.email?.trim() || null;

  // Someone already on file is a link, not a second record.
  const digits = phone?.replace(/\D/g, "") ?? "";
  const clauses: Prisma.CustomerWhereInput[] = [customerNameWhere(name)];
  if (digits.length >= 7) {
    clauses.push({ mobile: { contains: digits.slice(-7) } }, { phone: { contains: digits.slice(-7) } });
  }
  if (email) clauses.push({ email: { equals: email, mode: "insensitive" } });
  const existing = await db.customer.findMany({
    where: { shopId, OR: clauses },
    take: 3,
    select: { id: true, firstName: true, lastName: true, businessName: true, mobile: true, phone: true },
  });
  if (existing.length > 0) {
    return {
      kind: "info",
      message: `That looks like someone already on file:`,
      links: existing.map((customer) => ({
        label: personName(customer),
        href: `/customers/${customer.id}`,
        detail: customer.mobile || customer.phone || "Open customer",
      })),
    };
  }

  const details = [phone, email].filter(Boolean).join(" · ");
  return {
    kind: "confirm",
    message: `Add ${name}${details ? ` (${details})` : ""} as a new customer?`,
    pending: { type: "create_customer", name, phone, email },
    confirmLabel: "Add customer",
  };
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? name, lastName: parts.slice(1).join(" ") };
}

function personName(
  customer: {
    firstName: string;
    lastName: string;
    businessName: string | null;
  } | null,
): string {
  if (!customer) return "No customer";
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  return name || customer.businessName || "Unnamed";
}

/** Every whitespace token must match the name, SKU or category. */
function nameWhere(shopId: string, query: string) {
  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    shopId,
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { sku: { contains: token, mode: "insensitive" as const } },
        { category: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
}
