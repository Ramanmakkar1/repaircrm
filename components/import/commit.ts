import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import type { ImportBatch } from "@/lib/import-store";
import {
  fieldsFor,
  GENERATE_SKU,
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
 *
 * ONE BAD ROW MUST NOT SINK ITS NEIGHBOURS. Postgres aborts a whole transaction
 * when any statement in it fails, so a try/catch around one row inside the batch
 * transaction cannot save the rows after it. Instead a failed batch is rolled
 * back and replayed row by row, one small transaction each: the bad row is
 * listed with a reason, every other row is saved. Everything a try learns (new
 * ids, vendors, counts) stays in that try's own `Attempt` and joins the shared
 * state only once its transaction has committed, so the summary can never claim
 * a row that was rolled back.
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

/** Stable across repeated imports; prices/counts never change item identity. */
export function sheetProductCode(name: string, upc: string): string {
  const identity = [name, upc].map(value => value.trim().toLowerCase().replace(/\s+/g, " "));
  return `IMP-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 20).toUpperCase()}`;
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
    const raw = field.key === "sku" && mapping.sku === GENERATE_SKU
      ? sheetProductCode(cell(row, mapping.name ?? -1), cell(row, mapping.upc ?? -1))
      : cell(row, mapping[field.key] ?? -1);
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
    if (field.kind === "money" && !Number.isNaN(readMoney(raw))) {
      const cents = readMoney(raw);
      if (cents !== null && (cents < 0 || cents > 100_000_000)) errors.push(`${field.label} must be between 0 and 1,000,000`);
    }
    if (field.kind === "int") {
      const parsed = readInt(raw);
      if (Number.isNaN(parsed)) errors.push(`${field.label} “${raw}” isn't a whole number`);
      else if (parsed !== null && (parsed < 0 || parsed > 2_147_483_647)) errors.push(`${field.label} must be a whole number from 0 to 2,147,483,647`);
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

/** What the row writers need from a key -> id table; a Map or a Layer. */
type Lookup = {
  get(key: string): string | undefined;
  has(key: string): boolean;
  set(key: string, id: string): unknown;
};
type Seen = Record<keyof Existing, Lookup>;

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
  existing: Seen,
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
      rows.push({ row: index + (batch.headerRow ?? 1) + 1, values, errors, duplicate });
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

/**
 * A key -> id table that keeps its own additions apart from `base` until
 * `merge()`. An attempt at some rows registers new ids only here, so one that
 * rolls back leaves the shared lookups exactly as they were.
 */
class Layer implements Lookup {
  private readonly added = new Map<string, string>();

  constructor(private readonly base: Map<string, string>) {}

  get(key: string): string | undefined {
    return this.added.get(key) ?? this.base.get(key);
  }

  has(key: string): boolean {
    return this.added.has(key) || this.base.has(key);
  }

  set(key: string, id: string): this {
    this.added.set(key, id);
    return this;
  }

  merge(): void {
    for (const [key, id] of this.added) this.base.set(key, id);
  }
}

/** Everything one try at some rows reads, registers and counts. */
type Attempt = {
  seen: { byEmail: Layer; byPhone: Layer; bySku: Layer };
  vendors: Layer;
  tally: ImportSummary;
};

function startAttempt(existing: Existing, vendorIds: Map<string, string>): Attempt {
  return {
    seen: {
      byEmail: new Layer(existing.byEmail),
      byPhone: new Layer(existing.byPhone),
      bySku: new Layer(existing.bySku),
    },
    vendors: new Layer(vendorIds),
    tally: { created: 0, updated: 0, skipped: 0, errors: [] },
  };
}

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

  /** Only called once the attempt's transaction has committed. */
  const keep = (attempt: Attempt) => {
    attempt.seen.byEmail.merge();
    attempt.seen.byPhone.merge();
    attempt.seen.bySku.merge();
    attempt.vendors.merge();
    summary.created += attempt.tally.created;
    summary.updated += attempt.tally.updated;
    summary.skipped += attempt.tally.skipped;
    summary.errors.push(...attempt.tally.errors);
  };

  /**
   * Settles a row without the database when it can be (bad values, a duplicate
   * being skipped); otherwise returns what has to be written.
   */
  const prepare = (row: readonly string[], rowNumber: number, attempt: Attempt) => {
    const { values, errors } = readRow(fields, mapping, row);

    if (errors.length > 0) {
      attempt.tally.errors.push({ row: rowNumber, message: errors[0] });
      attempt.tally.skipped += 1;
      return null;
    }

    const clash = findDuplicate(batch.kind, values, attempt.seen);
    if (clash && mode === "skip") {
      attempt.tally.skipped += 1;
      return null;
    }
    return { values, duplicateId: clash?.id ?? null };
  };

  const write = (
    tx: Prisma.TransactionClient,
    job: NonNullable<ReturnType<typeof prepare>>,
    attempt: Attempt,
  ) =>
    batch.kind === "customers"
      ? writeCustomer(tx, shopId, job.values, job.duplicateId, attempt.tally, attempt.seen)
      : writeProduct(
          tx,
          shopId,
          job.values,
          job.duplicateId,
          attempt.tally,
          attempt.seen,
          attempt.vendors,
        );

  for (let start = 0; start < batch.rows.length; start += BATCH_SIZE) {
    const slice = batch.rows.slice(start, start + BATCH_SIZE);
    const rowNumber = (offset: number) => start + offset + (batch.headerRow ?? 1) + 1;

    // Fast path: the whole batch in one transaction.
    const whole = startAttempt(existing, vendorIds);
    let saved = false;
    try {
      await db.$transaction(async (tx) => {
        for (let offset = 0; offset < slice.length; offset++) {
          const job = prepare(slice[offset], rowNumber(offset), whole);
          if (job) await write(tx, job, whole);
        }
      });
      saved = true;
    } catch (error) {
      // Rolled back, so nothing from this batch exists and `whole` is simply
      // dropped. Say why on the server console, then find the bad row below.
      console.warn(
        `[import] a batch of ${slice.length} rows failed, retrying row by row: ${technicalMessage(error)}`,
      );
    }
    if (saved) {
      keep(whole);
      continue;
    }

    // Slow path: one small transaction per row, so a bad row costs only itself.
    for (let offset = 0; offset < slice.length; offset++) {
      const single = startAttempt(existing, vendorIds);
      const job = prepare(slice[offset], rowNumber(offset), single);
      try {
        if (job) await db.$transaction((tx) => write(tx, job, single));
      } catch (error) {
        console.warn(`[import] row ${rowNumber(offset)} failed: ${technicalMessage(error)}`);
        summary.errors.push({ row: rowNumber(offset), message: plainReason(error) });
        summary.skipped += 1;
        continue;
      }
      keep(single);
    }
  }

  return summary;
}

/** Raised for a row's own problem, already worded for the person reading the summary. */
class RowProblem extends Error {}

/** For the server console only — never shown to the shop. */
function technicalMessage(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : "unknown error";
}

/** What the summary says about a row the database refused, in plain words. */
function plainReason(error: unknown): string {
  if (error instanceof RowProblem) return error.message;
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === "P2002") return "Something with the same code, email or phone is already on file.";
  if (code === "P2000") return "One of the values in this row is too long to save.";
  return "Couldn't save this row. Check its values and try again.";
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
  existing: Seen,
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
    // updateMany with the shop in the filter, as lib/db.ts asks of every write by id.
    const { count } = await tx.customer.updateMany({
      where: { id: duplicateId, shopId },
      data: {
        ...text,
        // A name is always present on an update path too; the row passed
        // validation, so firstName is real.
        firstName: values.firstName,
        ...(values.lastName ? { lastName: values.lastName } : {}),
      },
    });
    if (count === 0) throw new RowProblem("That customer was removed while the import was running.");
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
  existing: Seen,
  vendorIds: Lookup,
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
    const { count } = await tx.product.updateMany({ where: { id: duplicateId, shopId }, data });
    if (count === 0) throw new RowProblem("That product was removed while the import was running.");
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
  cache: Lookup,
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
