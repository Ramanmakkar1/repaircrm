import type { Prisma } from "@prisma/client";

/**
 * Serial-number tracking for products where every unit is an individual thing —
 * a refurbished handset, a battery pack under warranty, a graphics card.
 *
 * ---------------------------------------------------------------------------
 * THE ONE INVARIANT
 * ---------------------------------------------------------------------------
 * For a serialized product, `Product.stockQty` is NOT an independently edited
 * number: it is a cache of "how many ProductSerial rows are IN_STOCK". Every
 * path that moves a serial (receiving a purchase order, adding units by hand,
 * selling at the till or on an invoice, marking one defective, voiding an
 * invoice) ends by calling `syncSerializedStock`, which recounts and writes the
 * difference as one StockAdjustment. That makes the invariant self-healing
 * rather than something each caller has to arithmetic its way to, and it makes
 * a no-op re-save genuinely write nothing.
 *
 * Everything here takes a transaction client and does no revalidation: these
 * are the inner steps of somebody else's transaction, never an action.
 */

type Tx = Prisma.TransactionClient;

/** Raised for a serial problem a user can fix; callers turn it into a message. */
export class SerialError extends Error {}

/** Units the shop can still sell. Anything else is off the shelf. */
export const IN_STOCK = "IN_STOCK" as const;

export const SERIAL_STATUSES = [
  "IN_STOCK",
  "SOLD",
  "RETURNED",
  "DEFECTIVE",
] as const;

export type SerialStatusName = (typeof SERIAL_STATUSES)[number];

export function isSerialStatus(value: string): value is SerialStatusName {
  return (SERIAL_STATUSES as readonly string[]).includes(value);
}

/**
 * Turns a pasted block into a clean list of serials.
 *
 * Staff paste from a packing slip, so the separator is whatever the slip used:
 * newlines, commas, or tabs. Blanks are dropped and duplicates collapse — the
 * count the caller checks against the received quantity is the count of
 * DISTINCT units, which is what a box actually contains.
 */
export function parseSerialList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of input.split(/[\n\r,\t]+/)) {
    const serial = piece.trim();
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);
    out.push(serial.slice(0, 120));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stock reconciliation
// ---------------------------------------------------------------------------

/**
 * Recounts IN_STOCK units for each serialized product and, where the cached
 * `stockQty` disagrees, corrects it and records the move.
 *
 * Non-serialized products are skipped, so it is safe to hand this every
 * productId a transaction touched without filtering first.
 */
export async function syncSerializedStock(
  tx: Tx,
  input: {
    shopId: string;
    userId: string | null;
    productIds: readonly string[];
    reason: string;
  },
): Promise<void> {
  const ids = [...new Set(input.productIds.filter(Boolean))];
  if (ids.length === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: ids }, shopId: input.shopId, serialized: true },
    select: { id: true, stockQty: true },
  });

  for (const product of products) {
    const onHand = await tx.productSerial.count({
      where: { shopId: input.shopId, productId: product.id, status: IN_STOCK },
    });
    const delta = onHand - product.stockQty;
    if (delta === 0) continue;

    await tx.product.update({
      where: { id: product.id },
      data: { stockQty: onHand },
    });
    await tx.stockAdjustment.create({
      data: {
        shopId: input.shopId,
        productId: product.id,
        delta,
        reason: input.reason,
        userId: input.userId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

/**
 * Creates IN_STOCK units for a serialized product.
 *
 * A serial is unique per (shop, product) in the schema, so re-receiving one
 * that is already on the shelf is a data-entry mistake worth refusing loudly —
 * silently skipping it would leave the box short with nothing to explain why.
 * A unit that was SOLD and has come back is reinstated rather than duplicated.
 */
export async function receiveSerials(
  tx: Tx,
  input: {
    shopId: string;
    productId: string;
    serials: readonly string[];
    notes?: string | null;
  },
): Promise<void> {
  if (input.serials.length === 0) return;

  const existing = await tx.productSerial.findMany({
    where: {
      shopId: input.shopId,
      productId: input.productId,
      serial: { in: [...input.serials] },
    },
    select: { id: true, serial: true, status: true },
  });

  const clash = existing.filter((row) => row.status === IN_STOCK);
  if (clash.length > 0) {
    throw new SerialError(
      `Already in stock: ${clash.map((row) => row.serial).join(", ")}.`,
    );
  }

  const byName = new Map(existing.map((row) => [row.serial, row]));
  const fresh = input.serials.filter((serial) => !byName.has(serial));

  for (const row of existing) {
    await tx.productSerial.update({
      where: { id: row.id },
      data: {
        status: IN_STOCK,
        invoiceLineId: null,
        soldAt: null,
        receivedAt: new Date(),
        notes: input.notes ?? null,
      },
    });
  }

  if (fresh.length > 0) {
    await tx.productSerial.createMany({
      data: fresh.map((serial) => ({
        shopId: input.shopId,
        productId: input.productId,
        serial,
        status: IN_STOCK,
        notes: input.notes ?? null,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------------

/** One unit that changed hands, returned so the caller can reconcile stock. */
export type SerialMove = { productId: string; serial: string };

/**
 * Attaches every serial written on an invoice's lines to its physical unit and
 * marks it SOLD.
 *
 * The lines are re-read from the database rather than trusted from the form:
 * the serial has to belong to this shop, to the product on that line, and be
 * IN_STOCK — otherwise the same unit could be sold twice.
 */
export async function markInvoiceSerialsSold(
  tx: Tx,
  input: { shopId: string; invoiceId: string },
): Promise<SerialMove[]> {
  const lines = await tx.invoiceLine.findMany({
    where: {
      invoiceId: input.invoiceId,
      serial: { not: null },
      product: { serialized: true },
    },
    select: { id: true, productId: true, serial: true },
  });
  if (lines.length === 0) return [];

  const moved: SerialMove[] = [];
  const soldAt = new Date();

  for (const line of lines) {
    if (!line.productId || !line.serial) continue;
    const unit = await tx.productSerial.findFirst({
      where: {
        shopId: input.shopId,
        productId: line.productId,
        serial: line.serial,
        status: IN_STOCK,
      },
      select: { id: true },
    });
    if (!unit) {
      throw new SerialError(
        `Serial ${line.serial} is not in stock — pick another unit.`,
      );
    }
    await tx.productSerial.update({
      where: { id: unit.id },
      data: { status: "SOLD", invoiceLineId: line.id, soldAt },
    });
    moved.push({ productId: line.productId, serial: line.serial });
  }

  return moved;
}

/**
 * The reverse: every unit an invoice sold goes back on the shelf.
 *
 * Used when an invoice is voided and when its lines are rewritten (the editor
 * replaces all lines, so the old attachments have to be undone before the new
 * ones are made).
 */
export async function releaseInvoiceSerials(
  tx: Tx,
  input: { shopId: string; invoiceId: string },
): Promise<SerialMove[]> {
  const units = await tx.productSerial.findMany({
    where: {
      shopId: input.shopId,
      status: "SOLD",
      invoiceLine: { invoiceId: input.invoiceId },
    },
    select: { id: true, productId: true, serial: true },
  });
  if (units.length === 0) return [];

  await tx.productSerial.updateMany({
    where: { id: { in: units.map((unit) => unit.id) } },
    data: { status: IN_STOCK, invoiceLineId: null, soldAt: null },
  });

  return units.map((unit) => ({ productId: unit.productId, serial: unit.serial }));
}
