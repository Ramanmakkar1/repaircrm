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
import { parseCents } from "@/lib/money";

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
    active: flag(formData, "active"),
  };
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
  const input = parsed.data;

  if (await skuTaken(shopId, input.sku)) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { sku: DUPLICATE_SKU } };
  }

  let productId: string;
  try {
    // The opening balance and its audit row are written together, so a product
    // that starts at 6 on hand has a history explaining where those 6 came from.
    productId = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          shopId,
          name: input.name,
          category: input.category,
          sku: input.sku,
          upc: input.upc,
          description: input.description,
          priceCents: input.priceCents,
          // Cost is owner-only information; a non-owner can't set it.
          costCents: role === "OWNER" ? input.costCents : null,
          taxable: input.taxable,
          stockQty: input.stockQty,
          lowStockAt: input.lowStockAt,
          active: input.active,
        },
        select: { id: true, stockQty: true },
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

      return product.id;
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
  // redirect() throws — must stay outside the try/catch above.
  redirect(`/inventory/${productId}?flash=created`);
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { shopId, role } = await requireUser();

  const id = text(formData, "id");
  if (!id) return { error: "Missing product id." };

  const owned = await db.product.findFirst({
    where: { id, shopId },
    select: { id: true },
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

  try {
    await db.product.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        sku: input.sku,
        upc: input.upc,
        description: input.description,
        priceCents: input.priceCents,
        // Omitted entirely for a non-owner: the form never showed them the
        // cost, so submitting must not blank it.
        ...(role === "OWNER" ? { costCents: input.costCents } : {}),
        taxable: input.taxable,
        lowStockAt: input.lowStockAt,
        active: input.active,
        // stockQty is deliberately NOT here. Stock only moves through
        // adjustStockAction, so every change lands in the audit trail.
      },
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

  if (amount === null) {
    return { error: mode === "count" ? "Enter the counted quantity." : "Enter a quantity." };
  }
  if (mode === "count" && amount < 0) {
    return { error: "A counted quantity can't be negative." };
  }
  if (!isStockReason(reason)) {
    return { error: "Choose a reason for this adjustment." };
  }
  if ((note?.length ?? 0) > 500) {
    return { error: "Notes are limited to 500 characters." };
  }

  const outcome = await db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId },
      select: { id: true, stockQty: true },
    });
    if (!product) return "missing" as const;

    const delta = mode === "count" ? amount - product.stockQty : amount;
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
