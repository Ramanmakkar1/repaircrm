import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { ImportBatch } from "@/lib/import-store";
import {
  fieldsFor,
  looksLikeEmail,
  readBool,
  readInt,
  readMoney,
  type ImportField,
  type ImportKind,
  type Mapping,
} from "./fields";

/**
 * Validating and writing an uploaded CSV.
 *
 * Server-only (it pulls in Prisma) but NOT a "use server" module: the thin
 * action files in the two import route segments are the endpoints, and they
 * resolve `shopId` from the session before calling in here. Same reasoning as
 * app/(app)/pos/checkout.ts — the transaction is reachable only through a guard
 * that has already decided who the caller is.
 *
 * DUPLICATES are matched the way a shop would: customers by email, falling back
 * to phone; products by SKU. A duplicate is either skipped or updated, never
 * silently doubled — importing the same export twice is the single most common
 * thing that happens to an import feature.
 *
 * BATCHING: rows are written 200 at a time, each batch in its own transaction.
 * One 5,000-row transaction would hold locks for the whole upload and lose
 * everything to a single bad row; per-batch keeps failures small and progress
 * real.
 */

const BATCH_SIZE = 200;
const PREVIEW_ROWS = 20;

export type DuplicateMode = "skip" | "update";

export type PreviewRow = {
  /** 1-based row number in the file, counting the header as row 1. */
  row: number;
  values: Record<string, string>;
  errors: string[];
  /** What this row would collide with, in words ("email elena@…"). */
  duplicate: string | null;
};

export type ImportPreview = {
  rows: PreviewRow[];
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
};

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

// ---------------------------------------------------------------------------
// Row reading + validation
// ---------------------------------------------------------------------------

type ReadRow = { values: Record<string, string>; errors: string[] };

function cell(row: readonly string[], index: number): string {
  return index < 0 ? "" : (row[index] ?? "").trim();
}

/** Pulls the mapped columns out of one row and says what's wrong with it. */
function readRow(
  fields: ImportField[],
  mapping: Mapping,
  row: readonly string[],
): ReadRow {
  const values: Record<string, string> = {};
  const errors: string[] = [];

  for (const field of fields) {
    const raw = cell(row, mapping[field.key] ?? -1);
    values[field.key] = raw;

    if (field.required && raw === "") {
      errors.push(`${field.label} is required`);
      continue;
    }
    if (raw === "") continue;

    if (field.kind === "email" && !looksLikeEmail(raw)) {
      errors.push(`${raw} doesn't look like an email address`);
    }
    if (field.kind === "money" && Number.isNaN(readMoney(raw))) {
      errors.push(`${field.label} “${raw}” isn't a number`);
    }
    if (field.kind === "int") {
      const parsed = readInt(raw);
      if (Number.isNaN(parsed)) errors.push(`${field.label} “${raw}” isn't a whole number`);
      else if (parsed !== null && parsed < 0) errors.push(`${field.label} can't be negative`);
    }
  }

  return { values, errors };
}

/** Digits only, so "(555) 010-2201" and "5550102201" are the same person. */
function phoneKey(value: string): string {
  return value.replace(/\D/g, "");
}

function emailKey(value: string): string {
  return value.trim().toLowerCase();
}

function skuKey(value: string): string {
  return value.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Existing rows
// ---------------------------------------------------------------------------

type Existing = {
  byEmail: Map<string, string>;
  byPhone: Map<string, string>;
  bySku: Map<string, string>;
};

/**
 * Everything already in the shop that a row could collide with.
 *
 * Loaded once and held in memory rather than queried per row: 5,000 rows would
 * otherwise be 5,000 round trips, and a shop's customer list is small enough
 * that two ids-and-keys queries are cheaper than one of them.
 */
async function loadExisting(shopId: string, kind: ImportKind): Promise<Existing> {
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const bySku = new Map<string, string>();

  if (kind === "customers") {
    const rows = await db.customer.findMany({
      where: { shopId },
      select: { id: true, email: true, phone: true, mobile: true },
    });
    for (const row of rows) {
      if (row.email) byEmail.set(emailKey(row.email), row.id);
      for (const number of [row.phone, row.mobile]) {
        const key = phoneKey(number ?? "");
        if (key.length >= 7 && !byPhone.has(key)) byPhone.set(key, row.id);
      }
    }
  } else {
    const rows = await db.product.findMany({
      where: { shopId, sku: { not: null } },
      select: { id: true, sku: true },
    });
    for (const row of rows) {
      if (row.sku) bySku.set(skuKey(row.sku), row.id);
    }
  }

  return { byEmail, byPhone, bySku };
}

/** The id this row would collide with, and a human phrase naming the match. */
function findDuplicate(
  kind: ImportKind,
  values: Record<string, string>,
  existing: Existing,
): { id: string; label: string } | null {
  if (kind === "customers") {
    const email = emailKey(values.email ?? "");
    if (email) {
      const id = existing.byEmail.get(email);
      if (id) return { id, label: `email ${email}` };
    }
    for (const key of ["phone", "mobile"]) {
      const phone = phoneKey(values[key] ?? "");
      if (phone.length >= 7) {
        const id = existing.byPhone.get(phone);
        if (id) return { id, label: `phone ${values[key]}` };
      }
    }
    return null;
  }

  const sku = skuKey(values.sku ?? "");
  if (!sku) return null;
  const id = existing.bySku.get(sku);
  return id ? { id, label: `SKU ${sku}` } : null;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Validates the whole file but only returns the first 20 rows.
 *
 * The counts are over everything, because "23 duplicates" is the number that
 * decides skip-vs-update; the rows are a sample, because nobody reads 5,000
 * preview rows and rendering them would be the slowest thing on the page.
 */
export async function previewImport(
  shopId: string,
  batch: ImportBatch,
  mapping: Mapping,
): Promise<ImportPreview> {
  const fields = fieldsFor(batch.kind);
  const existing = await loadExisting(shopId, batch.kind);
  const seen = new Set<string>();

  const rows: PreviewRow[] = [];
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;

  batch.rows.forEach((row, index) => {
    const { values, errors } = readRow(fields, mapping, row);
    const clash = findDuplicate(batch.kind, values, existing);

    // A file that lists the same person twice collides with itself, which the
    // database can't tell us about yet.
    const selfKey = selfKeyFor(batch.kind, values);
    const repeated = selfKey !== null && seen.has(selfKey);
    if (selfKey) seen.add(selfKey);

    const duplicate = clash?.label ?? (repeated ? "an earlier row in this file" : null);

    if (errors.length > 0) invalid += 1;
    else valid += 1;
    if (duplicate) duplicates += 1;

    if (rows.length < PREVIEW_ROWS) {
      rows.push({ row: index + 2, values, errors, duplicate });
    }
  });

  return { rows, total: batch.rows.length, valid, invalid, duplicates };
}

/** The key a row collides with itself on, or null when it has none. */
function selfKeyFor(kind: ImportKind, values: Record<string, string>): string | null {
  if (kind === "customers") {
    const email = emailKey(values.email ?? "");
    if (email) return `e:${email}`;
    const phone = phoneKey(values.phone ?? "") || phoneKey(values.mobile ?? "");
    return phone.length >= 7 ? `p:${phone}` : null;
  }
  const sku = skuKey(values.sku ?? "");
  return sku ? `s:${sku}` : null;
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export async function commitImport(
  shopId: string,
  batch: ImportBatch,
  mapping: Mapping,
  mode: DuplicateMode,
): Promise<ImportSummary> {
  const fields = fieldsFor(batch.kind);
  const existing = await loadExisting(shopId, batch.kind);
  const vendorIds = new Map<string, string>();

  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let start = 0; start < batch.rows.length; start += BATCH_SIZE) {
    const slice = batch.rows.slice(start, start + BATCH_SIZE);

    await db.$transaction(async (tx) => {
      for (let offset = 0; offset < slice.length; offset++) {
        const rowNumber = start + offset + 2;
        const { values, errors } = readRow(fields, mapping, slice[offset]);

        if (errors.length > 0) {
          summary.errors.push({ row: rowNumber, message: errors[0] });
          summary.skipped += 1;
          continue;
        }

        const clash = findDuplicate(batch.kind, values, existing);
        if (clash && mode === "skip") {
          summary.skipped += 1;
          continue;
        }

        try {
          if (batch.kind === "customers") {
            await writeCustomer(tx, shopId, values, clash?.id ?? null, summary, existing);
          } else {
            await writeProduct(
              tx,
              shopId,
              values,
              clash?.id ?? null,
              summary,
              existing,
              vendorIds,
            );
          }
        } catch (error) {
          summary.errors.push({ row: rowNumber, message: messageOf(error) });
          summary.skipped += 1;
        }
      }
    });
  }

  return summary;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0].slice(0, 200);
  return "Could not save this row.";
}

/** Blank cells never overwrite existing data — an import fills gaps, not holes. */
function filled(values: Record<string, string>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = (values[key] ?? "").trim();
    if (value !== "") out[key] = value;
  }
  return out;
}

async function writeCustomer(
  tx: Prisma.TransactionClient,
  shopId: string,
  values: Record<string, string>,
  duplicateId: string | null,
  summary: ImportSummary,
  existing: Existing,
): Promise<void> {
  const text = filled(values, [
    "businessName",
    "email",
    "phone",
    "mobile",
    "address1",
    "address2",
    "city",
    "state",
    "postalCode",
    "notes",
  ]);
  if (text.email) text.email = emailKey(text.email);

  if (duplicateId) {
    await tx.customer.update({
      where: { id: duplicateId },
      data: {
        ...text,
        // A name is always present on an update path too; the row passed
        // validation, so firstName is real.
        firstName: values.firstName,
        ...(values.lastName ? { lastName: values.lastName } : {}),
      },
    });
    summary.updated += 1;
    return;
  }

  const created = await tx.customer.create({
    data: {
      shopId,
      firstName: values.firstName,
      lastName: values.lastName || "",
      ...text,
    },
    select: { id: true },
  });
  summary.created += 1;

  // Register the new row so a later duplicate inside the same file is caught.
  if (text.email) existing.byEmail.set(text.email, created.id);
  for (const key of ["phone", "mobile"]) {
    const phone = phoneKey(text[key] ?? "");
    if (phone.length >= 7 && !existing.byPhone.has(phone)) {
      existing.byPhone.set(phone, created.id);
    }
  }
}

async function writeProduct(
  tx: Prisma.TransactionClient,
  shopId: string,
  values: Record<string, string>,
  duplicateId: string | null,
  summary: ImportSummary,
  existing: Existing,
  vendorIds: Map<string, string>,
): Promise<void> {
  const vendorId = await resolveVendor(tx, shopId, values.vendor ?? "", vendorIds);

  const priceCents = readMoney(values.priceCents ?? "");
  const costCents = readMoney(values.costCents ?? "");
  const stockQty = readInt(values.stockQty ?? "");
  const lowStockAt = readInt(values.lowStockAt ?? "");
  const taxable = readBool(values.taxable ?? "");

  const text = filled(values, ["name", "upc", "category", "vendorSku"]);
  const data = {
    ...text,
    ...(priceCents !== null ? { priceCents } : {}),
    ...(costCents !== null ? { costCents } : {}),
    ...(lowStockAt !== null ? { lowStockAt } : {}),
    ...(taxable !== null ? { taxable } : {}),
    ...(vendorId ? { vendorId } : {}),
  };

  if (duplicateId) {
    // Stock is deliberately NOT updated on an existing product: the level is an
    // audited quantity, and a spreadsheet column would move it with no
    // StockAdjustment behind it. Counts belong in the Adjust Stock dialog.
    await tx.product.update({ where: { id: duplicateId }, data });
    summary.updated += 1;
    return;
  }

  const opening = stockQty ?? 0;
  const created = await tx.product.create({
    data: {
      shopId,
      name: values.name,
      sku: skuKey(values.sku),
      stockQty: opening,
      ...data,
    },
    select: { id: true },
  });

  // A new product that arrives with stock gets the same "Initial stock" audit
  // row the manual create form writes.
  if (opening !== 0) {
    await tx.stockAdjustment.create({
      data: {
        shopId,
        productId: created.id,
        delta: opening,
        reason: "Initial stock — CSV import",
      },
    });
  }

  summary.created += 1;
  existing.bySku.set(skuKey(values.sku), created.id);
}

/**
 * Finds the vendor by name, creating it when the spreadsheet names one the shop
 * has never bought from.
 *
 * Creating is the right default: refusing the row would strand a whole
 * catalogue over a supplier nobody had typed in yet, and a vendor record is
 * cheap and editable.
 */
async function resolveVendor(
  tx: Prisma.TransactionClient,
  shopId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const found = await tx.vendor.findFirst({
    where: { shopId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  const id =
    found?.id ??
    (await tx.vendor.create({ data: { shopId, name: trimmed }, select: { id: true } })).id;

  cache.set(key, id);
  return id;
}
