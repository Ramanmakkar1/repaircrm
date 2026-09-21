"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  composeReason,
  isStockReason,
} from "@/components/inventory/format";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextSku } from "@/lib/inventory/sku";
import { parseCents } from "@/lib/money";
import { MAX_WARRANTY_DAYS } from "@/lib/warranty";
import {
  SerialError,
  isSerialStatus,
  parseSerialList,
  receiveSerials,
  syncSerializedStock,
} from "@/lib/serials";

/**
 * Server actions for the Inventory module.
 *
 * MULTI-TENANCY: every action resolves `shopId` from the session, and every
 * read/write is filtered by it. A productId arriving from the wire is only ever
 * trusted after a `findFirst({ where: { id, shopId } })` proves this shop owns
 * it. A shopId is never read from form data.
 *
 * STOCK: `Product.stockQty` is a cached level and `StockAdjustment` is the
 * audit trail. They are only ever written together, inside one transaction, so
 * the cached level can't drift from its history.
 *
 * SERIALS: for a product with `serialized = true` the level is not a number
 * somebody types — it is the count of IN_STOCK `ProductSerial` rows. Those
 * paths go through lib/serials.ts, which recounts and writes the difference as
 * one adjustment, so the same invariant holds however the units moved.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** `useActionState` shape for the full-page product form. */
export type ProductFormState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

/** Result shape for the dialog/inline actions the client awaits directly. */
export type InventoryActionState = { ok?: boolean; error?: string };

/**
 * Result of the Quick Add dialog. On success it carries the minted SKU back so
 * the toast can show it — proof to the user that a code was assigned for them,
 * which is the whole point of not making them type one.
 */
export type QuickAddState =
  | { ok: true; productId: string; name: string; sku: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }
  | undefined;

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Trimmed string, or undefined when the field was blank/absent. */
function text(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Radix Switch / native checkbox submit "on" only when checked. */
function flag(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

/** Money field -> cents, or null when the field was left blank. */
function cents(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  return raw === undefined ? null : parseCents(raw);
}

/** Whole-number field, or null when the field was left blank. */
function whole(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (raw === undefined) return null;
  const n = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

const DUPLICATE_SKU = "Another product in this shop already uses that SKU.";

/** How many times a MINTED (auto) SKU will re-draw its number after a race. */
const MAX_SKU_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Product create / update
// ---------------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().min(1, "Product name is required").max(160),
  category: z.string().max(80).nullable(),
  sku: z.string().max(60).nullable(),
  upc: z.string().max(40).nullable(),
  description: z.string().max(2000).nullable(),
  priceCents: z.number().int().min(0, "Price can't be negative"),
  costCents: z.number().int().min(0, "Cost can't be negative").nullable(),
  taxable: z.boolean(),
  stockQty: z.number().int("Stock must be a whole number"),
  lowStockAt: z
    .number()
    .int()
    .min(0, "The reorder point can't be negative")
    .nullable(),
  // The POLICY. Each sale snapshots it onto its own invoice line, so changing
  // it here never restates cover somebody already bought (see lib/warranty.ts).
  warrantyDays: z
    .number()
    .int()
    .min(0, "Warranty can't be negative")
    .max(MAX_WARRANTY_DAYS, "That warranty is longer than ten years")
    .nullable(),
  reorderQty: z
    .number()
    .int()
    .min(1, "Order at least one when reordering")
    .nullable(),
  vendorId: z.string().min(1).nullable(),
  vendorSku: z.string().max(80).nullable(),
  serialized: z.boolean(),
  active: z.boolean(),
});

type ProductInput = z.infer<typeof productSchema>;

function readProduct(formData: FormData): ProductInput {
  return {
    name: text(formData, "name") ?? "",
    category: text(formData, "category") ?? null,
    sku: text(formData, "sku")?.toUpperCase() ?? null,
    upc: text(formData, "upc") ?? null,
    description: text(formData, "description") ?? null,
    priceCents: cents(formData, "price") ?? 0,
    costCents: cents(formData, "cost"),
    taxable: flag(formData, "taxable"),
    stockQty: whole(formData, "stockQty") ?? 0,
    lowStockAt: whole(formData, "lowStockAt"),
    // 0 and blank both mean "no warranty"; null is what the column stores.
    warrantyDays: whole(formData, "warrantyDays") || null,
    reorderQty: whole(formData, "reorderQty"),
    vendorId: text(formData, "vendorId") ?? null,
    vendorSku: text(formData, "vendorSku") ?? null,
    serialized: flag(formData, "serialized"),
    active: flag(formData, "active"),
  };
}

/**
 * A vendorId is only trusted once this shop is proved to own it — a forged id
 * would otherwise point a product at another tenant's supplier.
 */
async function resolveVendorId(
  shopId: string,
  vendorId: string | null,
): Promise<string | null> {
  if (!vendorId) return null;
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, shopId },
    select: { id: true },
  });
  return vendor?.id ?? null;
}

/**
 * A SKU already used by another product in this shop. Checked up front so the
 * user gets a field-level message instead of a raw constraint error — the
 * P2002 catch below still covers the race between this check and the write.
 */
async function skuTaken(
  shopId: string,
  sku: string | null,
  exceptId?: string,
): Promise<boolean> {
  if (!sku) return false;
  const clash = await db.product.findFirst({
    where: { shopId, sku, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return clash !== null;
}

/**
 * Creates one product, minting a SKU when the caller didn't supply one.
 *
 * Shared by the full form (createProductAction) and the Quick Add dialog
 * (quickAddProductAction) so both get the same audit trail and the same SKU
 * behaviour. Returns a result instead of redirecting/revalidating — that is the
 * caller's job, because the two callers do it differently (a redirect vs a
 * toast).
 *
 * SKU: a code the USER typed is checked up front for a friendly field error, and
 * a clash on write is theirs to fix. A code we MINT can only clash by losing a
 * race for the next number, so that path re-draws and retries instead. Either
 * way the DB's @@unique([shopId, sku]) is the real guarantee.
 */
async function createProductCore(
  ctx: { shopId: string; userId: string; role: string },
  input: ProductInput,
): Promise<
  { ok: true; id: string; sku: string } | { ok: false; skuTaken: boolean }
> {
  const { shopId, userId, role } = ctx;

  if (input.sku && (await skuTaken(shopId, input.sku))) {
    return { ok: false, skuTaken: true };
  }

  const vendorId = await resolveVendorId(shopId, input.vendorId);
  const attempts = input.sku ? 1 : MAX_SKU_ATTEMPTS;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // The opening balance and its audit row are written together, so a product
      // that starts at 6 on hand has a history explaining where those 6 came from.
      return await db.$transaction(async (tx) => {
        const sku =
          input.sku ?? (await nextSku(tx, shopId, input.name, input.category));

        const product = await tx.product.create({
          data: {
            shopId,
            name: input.name,
            category: input.category,
            sku,
            upc: input.upc,
            description: input.description,
            priceCents: input.priceCents,
            // Cost is owner-only information; a non-owner can't set it.
            costCents: role === "OWNER" ? input.costCents : null,
            taxable: input.taxable,
            stockQty: input.serialized ? 0 : input.stockQty,
            lowStockAt: input.lowStockAt,
            warrantyDays: input.warrantyDays,
            reorderQty: input.reorderQty,
            vendorId,
            vendorSku: input.vendorSku,
            // A brand-new serialized product starts empty by definition: units
            // only exist once their serial numbers do.
            serialized: input.serialized,
            active: input.active,
          },
          select: { id: true, sku: true, stockQty: true },
        });

        if (product.stockQty !== 0) {
          await tx.stockAdjustment.create({
            data: {
              shopId,
              productId: product.id,
              delta: product.stockQty,
              reason: "Initial stock",
              userId,
            },
          });
        }

        return { ok: true as const, id: product.id, sku: product.sku ?? sku };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A typed SKU that raced is a duplicate the user can see and change.
        if (input.sku) return { ok: false, skuTaken: true };
        // A minted number that raced: loop and take the next one.
        continue;
      }
      throw error;
    }
  }

  // Only reachable when every minted number in the batch was taken mid-flight —
  // pathological contention, surfaced as a plain retryable error.
  return { ok: false, skuTaken: false };
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { shopId, userId, role } = await requireUser();

  const parsed = productSchema.safeParse(readProduct(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const result = await createProductCore({ shopId, userId, role }, parsed.data);
  if (!result.ok) {
    return result.skuTaken
      ? { error: "Please fix the highlighted fields.", fieldErrors: { sku: DUPLICATE_SKU } }
      : { error: "Couldn't save the product just now — please try again." };
  }

  revalidatePath("/inventory");
  // redirect() throws — must stay outside the try/catch inside the core above.
  redirect(`/inventory/${result.id}?flash=created`);
}

/**
 * The Quick Add dialog's create.
 *
 * The fast path: name, price, quantity and an optional category. Everything else
 * takes its column default and the SKU is always minted — so a counter person
 * gets an item on the shelf in four fields instead of fourteen, and never has to
 * invent a part number. It returns a result (no redirect) so the dialog can
 * toast, clear itself, and stay open for the next item.
 */
export async function quickAddProductAction(
  _prev: QuickAddState,
  formData: FormData,
): Promise<QuickAddState> {
  const { shopId, userId, role } = await requireUser();

  const input: ProductInput = {
    name: text(formData, "name") ?? "",
    category: text(formData, "category") ?? null,
    sku: null,
    upc: null,
    description: null,
    priceCents: cents(formData, "price") ?? 0,
    costCents: null,
    taxable: true,
    stockQty: whole(formData, "stockQty") ?? 0,
    lowStockAt: null,
    warrantyDays: null,
    reorderQty: null,
    vendorId: null,
    vendorSku: null,
    serialized: false,
    active: true,
  };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const result = await createProductCore({ shopId, userId, role }, parsed.data);
  if (!result.ok) {
    return { ok: false, error: "Couldn't save the product just now — please try again." };
  }

  revalidatePath("/inventory");
  return { ok: true, productId: result.id, name: parsed.data.name, sku: result.sku };
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { shopId, userId, role } = await requireUser();

  const id = text(formData, "id");
  if (!id) return { error: "Missing product id." };

  const owned = await db.product.findFirst({
    where: { id, shopId },
    select: { id: true, stockQty: true, serialized: true, sku: true },
  });
  if (!owned) return { error: "Product not found." };

  const parsed = productSchema.safeParse(readProduct(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const input = parsed.data;

  if (await skuTaken(shopId, input.sku, id)) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { sku: DUPLICATE_SKU } };
  }

  const vendorId = await resolveVendorId(shopId, input.vendorId);
  const turningOn = input.serialized && !owned.serialized;

  // Switching an already-stocked product to serial tracking is destructive to
  // the count: there are no serial numbers for the units on the shelf, and a
  // serialized product's level IS its IN_STOCK units. So the level is zeroed
  // (audited) and the shelf is re-entered as serials. The form warns first;
  // this refuses without that confirmation.
  if (turningOn && owned.stockQty !== 0 && !flag(formData, "serializedConfirm")) {
    return {
      error:
        "Turning on serial tracking resets the on-hand count so every unit can be entered by serial. Confirm on the form to continue.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          category: input.category,
          sku: input.sku ?? owned.sku ?? await nextSku(tx, shopId, input.name, input.category),
          upc: input.upc,
          description: input.description,
          priceCents: input.priceCents,
          // Omitted entirely for a non-owner: the form never showed them the
          // cost, so submitting must not blank it.
          ...(role === "OWNER" ? { costCents: input.costCents } : {}),
          taxable: input.taxable,
          lowStockAt: input.lowStockAt,
          warrantyDays: input.warrantyDays,
          reorderQty: input.reorderQty,
          vendorId,
          vendorSku: input.vendorSku,
          serialized: input.serialized,
          active: input.active,
          // stockQty is deliberately NOT here. Stock only moves through
          // adjustStockAction, so every change lands in the audit trail.
        },
      });

      if (turningOn && owned.stockQty !== 0) {
        await tx.product.update({ where: { id }, data: { stockQty: 0 } });
        await tx.stockAdjustment.create({
          data: {
            shopId,
            productId: id,
            delta: -owned.stockQty,
            reason: "Switched to serial tracking — re-enter units by serial",
            userId,
          },
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { sku: DUPLICATE_SKU },
      };
    }
    throw error;
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}?flash=updated`);
}

// ---------------------------------------------------------------------------
// Stock adjustments
// ---------------------------------------------------------------------------

/**
 * Moves a product's stock and records why.
 *
 * `mode=delta` takes a signed change (+5 received, -1 sold). `mode=count` takes
 * the number physically on the shelf and derives the delta from the level read
 * INSIDE the transaction, so two people counting at once can't overwrite each
 * other with a stale "from" value.
 *
 * A serialized product takes neither: it is handed off to
 * `adjustSerializedStock`, where the change is derived from the actual units
 * added or removed.
 */
export async function adjustStockAction(
  productId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { shopId, userId } = await requireUser();

  const mode = formData.get("mode") === "count" ? "count" : "delta";
  const amount = whole(formData, "amount");
  const reason = text(formData, "reason") ?? "";
  const note = text(formData, "note") ?? null;

  if (!isStockReason(reason)) {
    return { error: "Choose a reason for this adjustment." };
  }
  if ((note?.length ?? 0) > 500) {
    return { error: "Notes are limited to 500 characters." };
  }

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, stockQty: true, serialized: true },
  });
  if (!product) return { error: "Product not found." };

  if (product.serialized) {
    return adjustSerializedStock({
      shopId,
      userId,
      productId: product.id,
      mode,
      reason,
      note,
      formData,
    });
  }

  if (amount === null) {
    return { error: mode === "count" ? "Enter the counted quantity." : "Enter a quantity." };
  }
  if (mode === "count" && amount < 0) {
    return { error: "A counted quantity can't be negative." };
  }

  const outcome = await db.$transaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id: productId, shopId },
      select: { id: true, stockQty: true },
    });
    if (!current) return "missing" as const;

    const delta = mode === "count" ? amount - current.stockQty : amount;
    if (delta === 0) return "unchanged" as const;

    await tx.product.update({
      where: { id: productId },
      data: { stockQty: { increment: delta } },
    });
    await tx.stockAdjustment.create({
      data: {
        shopId,
        productId,
        delta,
        reason: composeReason(reason, note),
        userId,
      },
    });
    return "ok" as const;
  });

  if (outcome === "missing") return { error: "Product not found." };
  if (outcome === "unchanged") {
    return {
      error:
        mode === "count"
          ? "That count matches the current level — nothing to adjust."
          : "Enter a quantity other than zero.",
    };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}

/**
 * The serialized half of `adjustStockAction`.
 *
 * A serialized product has no quantity to nudge — it has units. Adding means
 * pasting the serials that arrived; removing means picking the exact units that
 * left. The signed change is therefore DERIVED from those lists rather than
 * typed, which is what keeps `stockQty` equal to the IN_STOCK count.
 *
 * "Set counted total" is refused outright: a number cannot say which cabinet
 * the missing handset was in.
 */
async function adjustSerializedStock(input: {
  shopId: string;
  userId: string;
  productId: string;
  mode: "delta" | "count";
  reason: string;
  note: string | null;
  formData: FormData;
}): Promise<InventoryActionState> {
  const { shopId, userId, productId, reason, note, formData } = input;

  if (input.mode === "count") {
    return {
      error:
        "This product is tracked by serial number — add the units you found or remove the ones that are gone.",
    };
  }

  const direction = formData.get("direction") === "remove" ? "remove" : "add";
  const composed = composeReason(reason, note);

  if (direction === "add") {
    const serials = parseSerialList(String(formData.get("serials") ?? ""));
    if (serials.length === 0) {
      return { error: "Paste the serial numbers that arrived, one per line." };
    }
    try {
      await db.$transaction(async (tx) => {
        await receiveSerials(tx, { shopId, productId, serials, notes: composed });
        await syncSerializedStock(tx, {
          shopId,
          userId,
          productIds: [productId],
          reason: composed,
        });
      });
    } catch (error) {
      if (error instanceof SerialError) return { error: error.message };
      throw error;
    }
  } else {
    const ids = formData
      .getAll("serialIds")
      .map((value) => String(value))
      .filter(Boolean);
    if (ids.length === 0) {
      return { error: "Pick which units are leaving stock." };
    }

    await db.$transaction(async (tx) => {
      // Scoped by shopId AND by status, so a stale checkbox for a unit somebody
      // else already sold moves nothing.
      await tx.productSerial.updateMany({
        where: { id: { in: ids }, shopId, productId, status: "IN_STOCK" },
        data: { status: removalStatusFor(reason), notes: composed },
      });
      await syncSerializedStock(tx, {
        shopId,
        userId,
        productIds: [productId],
        reason: composed,
      });
    });
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}

/**
 * Where a unit goes when it leaves the shelf outside a sale.
 *
 * "Sold" is a sale that happened somewhere this app didn't see. "Damaged" is a
 * write-off. Everything else — a count correction, a return to the supplier —
 * lands on RETURNED, which is the schema's word for "off the shelf, neither
 * sold nor broken".
 */
function removalStatusFor(reason: string): "SOLD" | "DEFECTIVE" | "RETURNED" {
  if (reason === "Sold") return "SOLD";
  if (reason === "Damaged") return "DEFECTIVE";
  return "RETURNED";
}

// ---------------------------------------------------------------------------
// Serial numbers
// ---------------------------------------------------------------------------

/**
 * Adds units to a serialized product from the product page.
 *
 * This is a stock-in: `receiveSerials` writes one row per unit and
 * `syncSerializedStock` turns the new IN_STOCK count into the level and its
 * StockAdjustment, in the same transaction.
 */
export async function addSerialsAction(
  productId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { shopId, userId } = await requireUser();

  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, serialized: true },
  });
  if (!product) return { error: "Product not found." };
  if (!product.serialized) {
    return { error: "Turn on serial tracking for this product first." };
  }

  const serials = parseSerialList(String(formData.get("serials") ?? ""));
  if (serials.length === 0) {
    return { error: "Paste at least one serial number." };
  }
  if (serials.length > 500) {
    return { error: "That's more than 500 units — add them in smaller batches." };
  }

  const note = text(formData, "note") ?? null;
  const reason = composeReason("Received", note ?? "Serials added");

  try {
    await db.$transaction(async (tx) => {
      await receiveSerials(tx, { shopId, productId, serials, notes: reason });
      await syncSerializedStock(tx, {
        shopId,
        userId,
        productIds: [productId],
        reason,
      });
    });
  } catch (error) {
    if (error instanceof SerialError) return { error: error.message };
    throw error;
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}

/**
 * Moves one unit between states — defective, returned, or back on the shelf.
 *
 * SOLD is not offered: a unit becomes sold by being sold, and un-selling it is
 * what voiding its invoice does. Letting a dropdown here contradict an invoice
 * would make the two disagree about the same physical thing.
 */
export async function setSerialStatusAction(
  serialId: string,
  status: string,
  note: string | null,
): Promise<InventoryActionState> {
  const { shopId, userId } = await requireUser();

  if (!isSerialStatus(status) || status === "SOLD") {
    return { error: "Choose defective, returned, or back in stock." };
  }

  const unit = await db.productSerial.findFirst({
    where: { id: serialId, shopId },
    select: { id: true, productId: true, serial: true, status: true },
  });
  if (!unit) return { error: "Serial not found." };
  if (unit.status === status) return { ok: true };

  const reason = `Serial ${unit.serial} → ${status.toLowerCase().replace("_", " ")}`;

  await db.$transaction(async (tx) => {
    await tx.productSerial.update({
      where: { id: unit.id },
      data: {
        status,
        notes: note?.slice(0, 500) || null,
        // A unit coming back on the shelf is no longer attached to a sale.
        ...(status === "IN_STOCK" ? { invoiceLineId: null, soldAt: null } : {}),
      },
    });
    await syncSerializedStock(tx, {
      shopId,
      userId,
      productIds: [unit.productId],
      reason,
    });
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${unit.productId}`);
  return { ok: true };
}

/** Quick-edit for the reorder point from the product's stock card. */
export async function setLowStockAction(
  productId: string,
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { shopId } = await requireUser();

  const value = whole(formData, "lowStockAt");
  if (value !== null && value < 0) {
    return { error: "The reorder point can't be negative." };
  }

  const updated = await db.product.updateMany({
    where: { id: productId, shopId },
    data: { lowStockAt: value },
  });
  if (updated.count === 0) return { error: "Product not found." };

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${productId}`);
  return { ok: true };
}
