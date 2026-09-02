"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  CANCELABLE_PO_STATUSES,
  RECEIVABLE_PO_STATUSES,
  asPoStatus,
  poStatusAfterReceipt,
  poTotals,
} from "@/components/inventory/purchasing";
import { requireUser } from "@/lib/auth";
import { deliverEmail } from "@/lib/comms/drivers";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import {
  SerialError,
  parseSerialList,
  receiveSerials,
  syncSerializedStock,
} from "@/lib/serials";
import { withNextNumber } from "@/lib/sequence";

/**
 * Purchase orders: what the shop asked a vendor for, and what actually turned up.
 *
 * ---------------------------------------------------------------------------
 * RECEIVING IS THE STOCK EVENT
 * ---------------------------------------------------------------------------
 * One receipt writes, in ONE transaction: the line's `receivedQty`, the
 * product's `stockQty`, a `StockAdjustment` explaining the move, the refreshed
 * unit cost, any `ProductSerial` rows for a serialized line, the order's new
 * status, and the RECEIVED flip on any ticket part order this order was
 * covering. Either all of that is true or none of it is — a half-received box
 * that moved stock without recording why is exactly the bug inventory features
 * are built to prevent.
 *
 * ---------------------------------------------------------------------------
 * NO DOUBLE COUNTING WITH TICKET PART ORDERS
 * ---------------------------------------------------------------------------
 * A ticket's PartOrder can be attached to a purchase order (see
 * `addPartOrderToPoAction`). Both paths know how to move stock, so exactly one
 * of them must:
 *
 *     THE PURCHASE ORDER RECEIPT IS THE STOCK EVENT.
 *
 * When `PartOrder.purchaseOrderId` is set, `markPartReceivedAction` in
 * app/(app)/tickets/actions.ts deliberately skips its own increment and audit
 * row — the boxes were counted in once, here, when they came off the van.
 *
 * ROLE: OWNER only, like the rest of purchasing — a PO is a page full of the
 * shop's buying prices.
 */

export type PoFormState = { error?: string } | undefined;
export type PoActionState = { ok?: boolean; error?: string };

const OWNER_ONLY = "Only an owner can manage purchase orders.";

const lineSchema = z.object({
  productId: z.string().min(1).nullable().catch(null),
  description: z.string().trim().min(1, "Every line needs a description").max(300),
  quantity: z.coerce.number().int().min(1).max(100_000),
  unitCostCents: z.coerce.number().int().min(0).max(100_000_000),
});

const linesSchema = z.array(lineSchema).min(1, "Add at least one line.");

function text(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function whole(formData: FormData, key: string): number {
  const value = Number.parseInt(text(formData, key).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(value) ? value : 0;
}

/** `<input type="date">` -> a Date at local midnight, or null when blank. */
function dateValue(formData: FormData, key: string): Date | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function revalidatePo(poId?: string): void {
  revalidatePath("/inventory");
  revalidatePath("/inventory/purchase-orders");
  revalidatePath("/inventory/vendors");
  if (poId) revalidatePath(`/inventory/purchase-orders/${poId}`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPurchaseOrderAction(
  _prev: PoFormState,
  formData: FormData,
): Promise<PoFormState> {
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const vendorId = text(formData, "vendorId");
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, shopId },
    select: { id: true },
  });
  if (!vendor) return { error: "Choose a vendor for this order." };

  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the order lines." };
  }
  const parsed = linesSchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid order lines." };
  }

  // Product ids arrive from the client, so only the ones this shop owns are
  // kept — an unknown id degrades to a free-text line rather than linking to
  // somebody else's catalogue.
  const owned = await ownedProductIds(shopId, parsed.data.map((line) => line.productId));

  const order = await withNextNumber(shopId, "purchaseOrder", (number) =>
    db.purchaseOrder.create({
      data: {
        shopId,
        vendorId: vendor.id,
        number,
        status: "DRAFT",
        shippingCents: Math.max(0, whole(formData, "shippingCents")),
        notes: text(formData, "notes") || null,
        expectedAt: dateValue(formData, "expectedAt"),
        createdById: userId,
        lines: {
          create: parsed.data.map((line, index) => ({
            productId: line.productId && owned.has(line.productId) ? line.productId : null,
            description: line.description,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    }),
  );

  revalidatePo();
  // redirect() throws — keep it outside anything that catches.
  redirect(`/inventory/purchase-orders/${order.id}`);
}

async function ownedProductIds(
  shopId: string,
  ids: readonly (string | null)[],
): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Set();
  const rows = await db.product.findMany({
    where: { id: { in: wanted }, shopId },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/** DRAFT → ORDERED. Stamps when it was placed and when it is due. */
export async function markPurchaseOrderedAction(
  poId: string,
  _prev: PoActionState,
  formData: FormData,
): Promise<PoActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const order = await db.purchaseOrder.findFirst({
    where: { id: poId, shopId },
    select: { id: true, status: true },
  });
  if (!order) return { error: "Purchase order not found." };
  if (order.status !== "DRAFT") {
    return { error: `A ${order.status.toLowerCase()} order has already been placed.` };
  }

  await db.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: "ORDERED",
      orderedAt: new Date(),
      expectedAt: dateValue(formData, "expectedAt"),
    },
  });

  revalidatePo(order.id);
  return { ok: true };
}

/** DRAFT/ORDERED → CANCELED. Never touches stock: nothing arrived. */
export async function cancelPurchaseOrderAction(poId: string): Promise<PoActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const order = await db.purchaseOrder.findFirst({
    where: { id: poId, shopId },
    select: { id: true, status: true },
  });
  if (!order) return { error: "Purchase order not found." };
  if (!CANCELABLE_PO_STATUSES.includes(asPoStatus(order.status))) {
    return {
      error: `A ${order.status.toLowerCase()} order can't be canceled — receiving has already moved stock.`,
    };
  }

  await db.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "CANCELED" },
  });

  revalidatePo(order.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

/**
 * Books in what turned up.
 *
 * The form posts `qty-<lineId>` for every line and, for a serialized product,
 * `serials-<lineId>` as pasted text. The serial count must equal the received
 * count — one row per physical unit is the whole point of serial tracking, and
 * accepting a mismatch would silently break the "stockQty == IN_STOCK units"
 * invariant that lib/serials.ts maintains.
 */
export async function receivePurchaseOrderAction(
  poId: string,
  _prev: PoActionState,
  formData: FormData,
): Promise<PoActionState> {
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const order = await db.purchaseOrder.findFirst({
    where: { id: poId, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          productId: true,
          description: true,
          quantity: true,
          receivedQty: true,
          unitCostCents: true,
          product: { select: { id: true, name: true, serialized: true } },
        },
      },
    },
  });
  if (!order) return { error: "Purchase order not found." };
  if (!RECEIVABLE_PO_STATUSES.includes(asPoStatus(order.status))) {
    return { error: `A ${order.status.toLowerCase()} order can't be received.` };
  }

  // ------------------------------------------------------------- read the form
  type Receipt = {
    lineId: string;
    productId: string | null;
    serialized: boolean;
    qty: number;
    serials: string[];
    unitCostCents: number;
    description: string;
  };

  const receipts: Receipt[] = [];
  for (const line of order.lines) {
    const remaining = Math.max(0, line.quantity - line.receivedQty);
    const asked = whole(formData, `qty-${line.id}`);
    const qty = Math.min(Math.max(0, asked), remaining);
    if (qty === 0) continue;

    const serialized = line.product?.serialized === true;
    const serials = serialized
      ? parseSerialList(String(formData.get(`serials-${line.id}`) ?? ""))
      : [];

    if (serialized && serials.length !== qty) {
      return {
        error: `${line.description}: ${qty} received but ${serials.length} serial${
          serials.length === 1 ? "" : "s"
        } pasted. Every unit needs its own serial number.`,
      };
    }

    receipts.push({
      lineId: line.id,
      productId: line.productId,
      serialized,
      qty,
      serials,
      unitCostCents: line.unitCostCents,
      description: line.description,
    });
  }

  if (receipts.length === 0) {
    return { error: "Enter how many of at least one line arrived." };
  }

  const reason = `PO #${order.number} received`;

  // --------------------------------------------------------------- write it all
  try {
    await db.$transaction(async (tx) => {
      for (const receipt of receipts) {
        await tx.purchaseOrderLine.update({
          where: { id: receipt.lineId },
          data: { receivedQty: { increment: receipt.qty } },
        });

        if (!receipt.productId) continue;

        if (receipt.serialized) {
          // Each unit becomes its own row; syncSerializedStock below turns the
          // new IN_STOCK count into the stock move and its audit line.
          await receiveSerials(tx, {
            shopId,
            productId: receipt.productId,
            serials: receipt.serials,
            notes: reason,
          });
        } else {
          // Scoped update: an id outside this shop matches nothing, and then the
          // adjustment would describe a movement that never happened.
          const moved = await tx.product.updateMany({
            where: { id: receipt.productId, shopId },
            data: { stockQty: { increment: receipt.qty } },
          });
          if (moved.count > 0) {
            await tx.stockAdjustment.create({
              data: {
                shopId,
                productId: receipt.productId,
                delta: receipt.qty,
                reason,
                userId,
              },
            });
          }
        }

        // What the shop just paid is now what the part costs. Margins on the
        // product page follow the last real invoice, not a stale guess.
        await tx.product.updateMany({
          where: { id: receipt.productId, shopId },
          data: { costCents: receipt.unitCostCents },
        });
      }

      await syncSerializedStock(tx, {
        shopId,
        userId,
        productIds: receipts
          .filter((r) => r.serialized && r.productId !== null)
          .map((r) => String(r.productId)),
        reason,
      });

      // ---------------------------------------------------------- new status
      const lines = order.lines.map((line) => {
        const receipt = receipts.find((r) => r.lineId === line.id);
        return {
          quantity: line.quantity,
          unitCostCents: line.unitCostCents,
          receivedQty: line.receivedQty + (receipt?.qty ?? 0),
        };
      });
      const status = poStatusAfterReceipt(lines, asPoStatus(order.status));

      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status,
          receivedAt: status === "RECEIVED" ? new Date() : null,
          // A draft that was received without ever being "placed" still had to
          // be placed with someone, so the clock is stamped rather than left
          // blank and confusing on the printed sheet.
          orderedAt: order.status === "DRAFT" ? new Date() : undefined,
        },
      });

      await closeCoveredPartOrders(tx, {
        shopId,
        userId,
        purchaseOrderId: order.id,
        poNumber: order.number,
        lines: order.lines.map((line) => {
          const receipt = receipts.find((r) => r.lineId === line.id);
          return {
            productId: line.productId,
            description: line.description,
            complete: line.receivedQty + (receipt?.qty ?? 0) >= line.quantity,
          };
        }),
      });
    });
  } catch (error) {
    if (error instanceof SerialError) return { error: error.message };
    throw error;
  }

  revalidatePo(order.id);
  revalidatePath("/tickets");
  return { ok: true };
}

/**
 * Flips the ticket part orders this receipt covered to RECEIVED.
 *
 * A PartOrder points at the whole purchase order, not at one line, so a line is
 * matched to it by product id when there is one and by description otherwise —
 * the same two things `addPartOrderToPoAction` writes the line from. Only a
 * fully-received line closes its part order: half a box does not unblock a
 * bench.
 *
 * No stock moves here. The units were counted in above; see the header.
 */
async function closeCoveredPartOrders(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    userId: string;
    purchaseOrderId: string;
    poNumber: number;
    lines: { productId: string | null; description: string; complete: boolean }[];
  },
): Promise<void> {
  const done = input.lines.filter((line) => line.complete);
  if (done.length === 0) return;

  const parts = await tx.partOrder.findMany({
    where: {
      shopId: input.shopId,
      purchaseOrderId: input.purchaseOrderId,
      status: { in: ["NEEDED", "ORDERED"] },
    },
    select: {
      id: true,
      ticketId: true,
      productId: true,
      description: true,
      quantity: true,
      ticket: { select: { number: true } },
    },
  });

  for (const part of parts) {
    const covered = done.some((line) =>
      part.productId
        ? line.productId === part.productId
        : line.description.toLowerCase() === part.description.toLowerCase(),
    );
    if (!covered) continue;

    await tx.partOrder.update({
      where: { id: part.id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });
    await tx.ticketComment.create({
      data: {
        shopId: input.shopId,
        ticketId: part.ticketId,
        authorId: input.userId,
        body: `Part received on PO #${input.poNumber}: ${part.quantity} × ${part.description}.`,
        isPublic: false,
        updateType: "Part received",
        channel: "NOTE",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Email to vendor
// ---------------------------------------------------------------------------

/**
 * Sends the order to the vendor.
 *
 * Deliberately NOT logged to CommunicationLog: that table is the customer's
 * conversation history, and a vendor is staff-side correspondence. It goes
 * straight through the mail driver, which in development prints the message to
 * the server log instead of sending it.
 */
export async function emailPurchaseOrderAction(poId: string): Promise<PoActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const order = await db.purchaseOrder.findFirst({
    where: { id: poId, shopId },
    select: {
      id: true,
      number: true,
      notes: true,
      shippingCents: true,
      expectedAt: true,
      vendor: { select: { name: true, email: true, accountNumber: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          description: true,
          quantity: true,
          unitCostCents: true,
          product: { select: { vendorSku: true, sku: true } },
        },
      },
    },
  });
  if (!order) return { error: "Purchase order not found." };
  if (!order.vendor.email) {
    return { error: `${order.vendor.name} has no email address on file.` };
  }

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true, email: true, phone: true },
  });

  const totals = poTotals(order.lines, order.shippingCents);
  const rows = order.lines.map((line) => ({
    sku: line.product?.vendorSku ?? line.product?.sku ?? "",
    description: line.description,
    quantity: line.quantity,
    amount: line.quantity * line.unitCostCents,
    unit: line.unitCostCents,
  }));

  const heading = `Purchase Order #${order.number} — ${shop?.name ?? "RepairFlow"}`;
  const textBody = [
    heading,
    order.vendor.accountNumber ? `Account: ${order.vendor.accountNumber}` : null,
    order.expectedAt ? `Needed by: ${order.expectedAt.toDateString()}` : null,
    "",
    ...rows.map(
      (row) =>
        `${row.quantity} × ${row.description}${row.sku ? ` [${row.sku}]` : ""} @ ${formatCents(row.unit)} = ${formatCents(row.amount)}`,
    ),
    "",
    `Subtotal: ${formatCents(totals.subtotalCents)}`,
    `Shipping: ${formatCents(totals.shippingCents)}`,
    `Total: ${formatCents(totals.totalCents)}`,
    order.notes ? `\nNotes: ${order.notes}` : null,
    "",
    [shop?.name, shop?.phone, shop?.email].filter(Boolean).join(" · "),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = [
    `<h2 style="font:600 18px system-ui,sans-serif;margin:0 0 12px">${escapeHtml(heading)}</h2>`,
    order.vendor.accountNumber
      ? `<p style="font:14px system-ui,sans-serif;margin:0 0 12px">Account ${escapeHtml(order.vendor.accountNumber)}</p>`
      : "",
    '<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font:14px system-ui,sans-serif">',
    '<tr style="background:#f1f5f9"><th align="left">Item</th><th align="left">SKU</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Amount</th></tr>',
    ...rows.map(
      (row) =>
        `<tr style="border-top:1px solid #e2e8f0"><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.sku)}</td><td align="right">${row.quantity}</td><td align="right">${formatCents(row.unit)}</td><td align="right">${formatCents(row.amount)}</td></tr>`,
    ),
    `<tr><td colspan="4" align="right"><strong>Total</strong></td><td align="right"><strong>${formatCents(totals.totalCents)}</strong></td></tr>`,
    "</table>",
    order.notes
      ? `<p style="font:14px system-ui,sans-serif;margin:16px 0 0">${escapeHtml(order.notes)}</p>`
      : "",
  ].join("");

  const status = await deliverEmail({
    to: order.vendor.email,
    subject: heading,
    text: textBody,
    html,
  });

  if (status.startsWith("failed")) {
    return { error: `Could not send: ${status.slice("failed: ".length)}` };
  }
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Ticket part orders → purchase orders
// ---------------------------------------------------------------------------

/**
 * Puts a ticket's part order onto a purchase order for its vendor.
 *
 * Reuses the vendor's open DRAFT order when there is one, so a morning of
 * tickets accumulates into a single order to place, and creates one otherwise.
 * The PartOrder keeps its own lifecycle; receiving the PO line is what marks it
 * RECEIVED (see `closeCoveredPartOrders`).
 */
export async function addPartOrderToPoAction(
  partOrderId: string,
  vendorId: string,
): Promise<PoActionState & { purchaseOrderId?: string; number?: number }> {
  const { shopId, userId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const part = await db.partOrder.findFirst({
    where: { id: partOrderId, shopId },
    select: {
      id: true,
      ticketId: true,
      productId: true,
      description: true,
      quantity: true,
      costCents: true,
      status: true,
      purchaseOrderId: true,
    },
  });
  if (!part) return { error: "Part order not found." };
  if (part.purchaseOrderId) {
    return { error: "That part is already on a purchase order." };
  }
  if (part.status === "RECEIVED" || part.status === "CANCELED") {
    return { error: `A ${part.status.toLowerCase()} part can't be ordered.` };
  }

  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, shopId, active: true },
    select: { id: true },
  });
  if (!vendor) return { error: "Choose an active vendor first." };

  const unitCostCents =
    part.costCents ??
    (part.productId
      ? (
          await db.product.findFirst({
            where: { id: part.productId, shopId },
            select: { costCents: true },
          })
        )?.costCents ?? 0
      : 0);

  const existing = await db.purchaseOrder.findFirst({
    where: { shopId, vendorId: vendor.id, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, _count: { select: { lines: true } } },
  });

  const target = existing
    ? existing
    : await withNextNumber(shopId, "purchaseOrder", (number) =>
        db.purchaseOrder.create({
          data: {
            shopId,
            vendorId: vendor.id,
            number,
            status: "DRAFT",
            createdById: userId,
          },
          select: { id: true, number: true, _count: { select: { lines: true } } },
        }),
      );

  await db.$transaction(async (tx) => {
    await tx.purchaseOrderLine.create({
      data: {
        purchaseOrderId: target.id,
        productId: part.productId,
        description: part.description,
        quantity: part.quantity,
        unitCostCents,
        sortOrder: target._count.lines,
      },
    });
    await tx.partOrder.update({
      where: { id: part.id },
      data: { purchaseOrderId: target.id, vendorId: vendor.id },
    });
  });

  revalidatePo(target.id);
  revalidatePath(`/tickets/${part.ticketId}`);
  return { ok: true, purchaseOrderId: target.id, number: target.number };
}
