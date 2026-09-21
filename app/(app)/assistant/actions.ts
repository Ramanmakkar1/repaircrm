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

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { interpretCommand, type AssistantIntent } from "@/lib/ai/assistant";
import {
  adjustStockAction,
  quickAddProductAction,
} from "@/app/(app)/inventory/actions";

export type AssistantOutcome =
  | { kind: "done"; message: string }
  | { kind: "info"; message: string; continuation?: string }
  | {
      kind: "confirm";
      message: string;
      remove: { productId: string; name: string };
    }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

type AddProductIntent = Extract<AssistantIntent, { action: "add_product" }>;

export async function runAssistantAction(text: string): Promise<AssistantOutcome> {
  const { shopId } = await requireUser();

  const interpreted = await interpretCommand(text);
  if (!interpreted.ok) return { kind: "error", message: interpreted.reason };

  const intent = interpreted.intent;
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
      return findTickets(shopId, intent.status ?? null, intent.customer ?? null);
    case "remove_product":
      return stageRemove(shopId, intent.product);
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

function ambiguous(query: string, names: string[]): AssistantOutcome {
  const list = names.map((name) => `• ${name}`).join("\n");
  return {
    kind: "info",
    message: `More than one product matches “${query}” — say which one:\n${list}`,
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
 * Sets a product's selling price. resolveProduct already proved this shop owns
 * the row (it queried by shopId), so the update is by id.
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
  if (!Number.isFinite(cents) || cents < 0) {
    return { kind: "error", message: "That price doesn't look right." };
  }

  await db.product.update({
    where: { id: resolved.product.id },
    data: { priceCents: cents },
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${resolved.product.id}`);
  return {
    kind: "done",
    message: `Set “${resolved.product.name}” price to ${formatCents(cents)}.`,
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

/** Lists repair tickets, optionally narrowed by status and/or customer name. */
async function findTickets(
  shopId: string,
  status: string | null,
  customer: string | null,
): Promise<AssistantOutcome> {
  const where: Prisma.TicketWhereInput = { shopId };
  if (status) where.status = { contains: status, mode: "insensitive" };
  if (customer) {
    where.customer = {
      OR: [
        { firstName: { contains: customer, mode: "insensitive" } },
        { lastName: { contains: customer, mode: "insensitive" } },
        { businessName: { contains: customer, mode: "insensitive" } },
      ],
    };
  }

  const tickets = await db.ticket.findMany({
    where,
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
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
  };
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
