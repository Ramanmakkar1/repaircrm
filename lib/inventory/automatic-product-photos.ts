import { createHash, randomUUID } from "node:crypto";
import { Prisma, type AutomaticProductPhoto } from "@prisma/client";

import { passwordVersion } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { removeUpload, storeUpload, type StoredUpload } from "@/lib/storage";
import type { AutomaticPhotoResult } from "./automatic-photo-types";
import { AUTOMATIC_PHOTO_CHANGES, automaticPhotoQuery, searchCommonsPhoto } from "./commons-photos";
import { productImageSource, PRODUCT_IMAGE_SELECT } from "./product-images";

const HOUR = 60 * 60 * 1000;
const MISS_BACKOFF = 7 * 24 * HOUR;
const ERROR_BACKOFF = 6 * HOUR;
const LEASE_MS = 2 * 60 * 1000;
const inflight = new Map<string, Promise<AutomaticPhotoResult>>();
const activeByShop = new Map<string, number>();
type Session = { shopId: string; userId: string; pv?: number };

export function automaticPhotoLookupKey(name: string) {
  return createHash("sha256").update(automaticPhotoQuery(name) ?? `unsearchable:${name}`).digest("hex");
}

export function automaticPhotoImageUrl(productId: string) {
  return `/inventory/${encodeURIComponent(productId)}/photo/automatic/image`;
}

export function automaticPhotoCachedResult(row: AutomaticProductPhoto | null, productId: string, lookupKey: string, now = new Date()): AutomaticPhotoResult | null {
  if (!row || row.lookupKey !== lookupKey) return null;
  if (row.status === "ready" && row.path && row.storage && row.mimeType && row.title && row.author && row.sourceUrl && row.license && row.licenseUrl) {
    return { ok: true, status: "ready", imageUrl: automaticPhotoImageUrl(productId), attribution: { title: row.title, author: row.author, sourceUrl: row.sourceUrl, license: row.license, licenseUrl: row.licenseUrl, ...(row.mimeType === "image/webp" ? { changes: AUTOMATIC_PHOTO_CHANGES } : {}) } };
  }
  if (row.nextAttemptAt > now) {
    const status = row.status === "pending" ? "pending" : row.status === "no_match" || row.status === "disabled" ? "no_match" : "unavailable";
    return empty(status, row.nextAttemptAt);
  }
  return null;
}

function empty(status: AutomaticPhotoResult["status"], retryAt?: Date): AutomaticPhotoResult {
  return { ok: true, status, imageUrl: null, attribution: null, ...(retryAt ? { retryAt: retryAt.toISOString() } : {}) };
}

// A picture chosen on purpose (catalogImage) counts like a matched one: no internet lookup for that product.
function sourceFor(product: { name: string; category: string | null; catalogImage?: string | null; attachments: Array<{ id: string }> }) {
  return productImageSource({ name: product.name, category: product.category, catalogImage: product.catalogImage, imageUrl: product.attachments[0] ? `/files/${product.attachments[0].id}` : null });
}

async function ownedProduct(tx: Prisma.TransactionClient, productId: string, shopId: string) {
  return tx.product.findFirst({
    where: { id: productId, shopId },
    select: { id: true, name: true, category: true, catalogImage: true, attachments: PRODUCT_IMAGE_SELECT, automaticPhoto: true },
  });
}

/** Share duplicate tile requests in this Node process; the database lease covers deploy/process races. */
export function getAutomaticProductPhoto(productId: string, session: Session): Promise<AutomaticPhotoResult> {
  const key = `${session.shopId}:${productId}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const task = lookup(productId, session).finally(() => { inflight.delete(key); });
  inflight.set(key, task);
  return task;
}

async function lookup(productId: string, session: Session): Promise<AutomaticPhotoResult> {
  let heldSlot = false;
  let stored: StoredUpload | null = null;
  let leaseToken: string | null = null;
  let lookupKey = "";
  let old: AutomaticProductPhoto | null = null;
  try {
    const claim = await db.$transaction(async (tx) => {
      // All claims for a tenant are serialised while counting the persisted hourly allowance.
      // PostgreSQL's lock function returns void. Cast it to text so Prisma's
      // raw-query deserialiser can read the result without cancelling the claim.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`automatic-photo:${session.shopId}`}))::text AS locked`);
      const product = await ownedProduct(tx, productId, session.shopId);
      if (!product) return { result: empty("skipped") };
      const source = sourceFor(product);
      if (source.src) return { result: { ...empty("skipped"), imageUrl: source.src } };
      const query = automaticPhotoQuery(product.name);
      if (!query) return { result: empty("no_match") };
      const currentKey = automaticPhotoLookupKey(product.name);
      const cached = automaticPhotoCachedResult(product.automaticPhoto, productId, currentKey);
      if (cached) return { result: cached };
      const now = new Date();
      if ((activeByShop.get(session.shopId) ?? 0) >= 2) return { result: empty("pending", new Date(now.getTime() + 30_000)) };
      const recentCount = await tx.automaticProductPhoto.count({ where: { shopId: session.shopId, searchedAt: { gte: new Date(now.getTime() - HOUR) } } });
      if (recentCount >= 20 || !rateLimit(`automatic-photo:${session.shopId}`, 30, HOUR).allowed) return { result: empty("unavailable", new Date(now.getTime() + HOUR)) };
      const token = randomUUID();
      const data = { shopId: session.shopId, lookupKey: currentKey, status: "pending", searchedAt: now, nextAttemptAt: new Date(now.getTime() + LEASE_MS), leaseToken: token };
      await tx.automaticProductPhoto.upsert({ where: { productId }, create: { ...data, productId }, update: data });
      activeByShop.set(session.shopId, (activeByShop.get(session.shopId) ?? 0) + 1);
      heldSlot = true;
      return { query, lookupKey: currentKey, leaseToken: token, old: product.automaticPhoto };
    });
    if ("result" in claim) return claim.result!;
    lookupKey = claim.lookupKey; leaseToken = claim.leaseToken; old = claim.old;
    const found = await searchCommonsPhoto(claim.query);
    if (!found) {
      const retryAt = new Date(Date.now() + MISS_BACKOFF);
      await finishEmpty(productId, session.shopId, leaseToken, "no_match", retryAt, old);
      return empty("no_match", retryAt);
    }
    const upload = await storeUpload(session.shopId, found.file);
    if (!upload.ok) throw new Error("Photo storage unavailable.");
    stored = upload.upload;
    const saved = await db.$transaction(async (tx) => {
      // Recheck tenant/product/account and priority after external work has completed.
      const product = await ownedProduct(tx, productId, session.shopId);
      const account = await tx.user.findFirst({ where: { id: session.userId, shopId: session.shopId }, select: { active: true, mustChangePassword: true, passwordChangedAt: true } });
      if (!product || sourceFor(product).src || automaticPhotoLookupKey(product.name) !== lookupKey || !account?.active || account.mustChangePassword || (session.pv ?? 0) < passwordVersion(account.passwordChangedAt)) return false;
      const updated = await tx.automaticProductPhoto.updateMany({
        where: { productId, shopId: session.shopId, leaseToken, lookupKey, status: "pending" },
        data: { status: "ready", leaseToken: null, nextAttemptAt: new Date("2100-01-01T00:00:00Z"), storage: stored!.storage, path: stored!.path, mimeType: stored!.mimeType, sizeBytes: stored!.sizeBytes, title: found.attribution.title, author: found.attribution.author, sourceUrl: found.attribution.sourceUrl, license: found.attribution.license, licenseUrl: found.attribution.licenseUrl },
      });
      return updated.count === 1;
    });
    if (!saved) {
      await removeUpload(stored.storage, stored.path); stored = null;
      await finishEmpty(productId, session.shopId, leaseToken, "unavailable", new Date(Date.now() + ERROR_BACKOFF), old);
      return empty("skipped");
    }
    if (old?.path && old.storage && old.path !== stored.path) await removeUpload(old.storage, old.path);
    return { ok: true, status: "ready", imageUrl: automaticPhotoImageUrl(productId), attribution: found.attribution };
  } catch {
    // A network outage leaves the normal placeholder and a persistent backoff, never a broken POS.
    if (stored) await removeUpload(stored.storage, stored.path);
    const retryAt = new Date(Date.now() + ERROR_BACKOFF);
    if (leaseToken) {
      try { await finishEmpty(productId, session.shopId, leaseToken, "unavailable", retryAt, old); } catch { /* A failed DB write leaves only the short lease. */ }
    }
    return empty("unavailable", retryAt);
  } finally {
    if (heldSlot) {
      const remaining = Math.max(0, (activeByShop.get(session.shopId) ?? 1) - 1);
      if (remaining) activeByShop.set(session.shopId, remaining); else activeByShop.delete(session.shopId);
    }
  }
}

async function finishEmpty(productId: string, shopId: string, leaseToken: string, status: "no_match" | "unavailable", retryAt: Date, old: AutomaticProductPhoto | null) {
  const updated = await db.automaticProductPhoto.updateMany({
    where: { productId, shopId, leaseToken, status: "pending" },
    data: { status, nextAttemptAt: retryAt, leaseToken: null, storage: null, path: null, mimeType: null, sizeBytes: 0, title: null, author: null, sourceUrl: null, license: null, licenseUrl: null },
  });
  if (updated.count && old?.path && old.storage) await removeUpload(old.storage, old.path);
}

/** Staff can dismiss an unsuitable match; automatic retries stay off until the catalogue name changes. */
export async function dismissAutomaticProductPhoto(productId: string, shopId: string): Promise<AutomaticPhotoResult> {
  const previous = await db.$transaction(async (tx) => {
    const product = await ownedProduct(tx, productId, shopId);
    if (!product?.automaticPhoto) return null;
    await tx.automaticProductPhoto.updateMany({
      where: { productId, shopId },
      data: { status: "disabled", lookupKey: automaticPhotoLookupKey(product.name), nextAttemptAt: new Date("2100-01-01T00:00:00Z"), leaseToken: null, storage: null, path: null, mimeType: null, sizeBytes: 0, title: null, author: null, sourceUrl: null, license: null, licenseUrl: null },
    });
    return product.automaticPhoto;
  });
  if (previous?.path && previous.storage) await removeUpload(previous.storage, previous.path);
  return empty("no_match", new Date("2100-01-01T00:00:00Z"));
}
