import "server-only";

import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, stat, statfs } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { storageDriverName, type StorageDriverName } from "@/lib/storage";

export type DatabaseStats = {
  storageBytes: number;
  activeSessions: number;
  totalSessions: number;
  maxConnections: number;
} | null;

/** The uploads folder on this server's disk (`public/uploads`, a Docker volume in production). */
export type UploadsFolder = {
  bytes: number;
  files: number;
  /** False when counting stopped at its time limit, so the real total is higher. */
  complete: boolean;
} | null;

export type DiskSpace = {
  totalBytes: number;
  freeBytes: number;
  /** The disk holding the uploads folder, or the app's own disk when there is no such folder. */
  measured: "uploads" | "app";
  /** Less than a tenth of the disk is free. */
  low: boolean;
} | null;

/** Files the app recorded, per place they are kept (`Attachment.storage`). */
export type StoredFiles = Array<{ storage: string; files: number; bytes: number }> | null;

export type AppRuntime = {
  /** False on a development copy, which has no live build to describe. */
  production: boolean;
  /** Next.js's random ID for this build; it changes with every deploy. */
  buildId: string | null;
  builtAt: Date | null;
  startedAt: Date;
  nodeVersion: string;
  /** Where new uploads are written (STORAGE_DRIVER). */
  storageDriver: StorageDriverName;
};

export type PlatformFailure = {
  id: string;
  kind: "webhook" | "integration" | "payments";
  title: string;
  shopName: string;
  message: string;
  occurredAt: Date;
};

export type FailureFeed = {
  rows: PlatformFailure[];
  unavailableSources: string[];
};

/** How long one page load may spend adding up the uploads folder. */
const UPLOADS_COUNT_MS = 3_000;
/** Files measured at once while counting. */
const STAT_BATCH = 64;
/** Below this share of free space the page warns that the disk is running low. */
const LOW_DISK_SHARE = 0.1;
/** Next.js build IDs are URL-safe random strings; anything else in that file is not shown. */
const BUILD_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/** PostgreSQL size and live sessions from the database itself. */
async function readDatabaseStats(): Promise<DatabaseStats> {
  try {
    const rows = await db.$queryRaw<
      Array<{
        storageBytes: bigint;
        activeSessions: number;
        totalSessions: number;
        maxConnections: number;
      }>
    >`
      SELECT
        pg_database_size(current_database()) AS "storageBytes",
        (SELECT count(*)::int FROM pg_stat_activity
          WHERE datname = current_database() AND state = 'active') AS "activeSessions",
        (SELECT count(*)::int FROM pg_stat_activity
          WHERE datname = current_database()) AS "totalSessions",
        current_setting('max_connections')::int AS "maxConnections"
    `;

    const stats = rows[0];
    if (!stats) return null;
    return {
      storageBytes: Number(stats.storageBytes),
      activeSessions: stats.activeSessions,
      totalSessions: stats.totalSessions,
      maxConnections: stats.maxConnections,
    };
  } catch {
    // Database roles may not be permitted to read activity or database size.
    return null;
  }
}

/**
 * Adds up the uploads folder. Only sizes are read, never contents; links are
 * not followed, so the count cannot wander outside the folder; and it stops at
 * UPLOADS_COUNT_MS so a huge folder or a slow disk cannot hold the page.
 */
async function readUploadsFolder(root: string): Promise<UploadsFolder> {
  const deadline = Date.now() + UPLOADS_COUNT_MS;
  const folders = [root];
  let bytes = 0;
  let files = 0;
  let complete = true;

  while (folders.length > 0) {
    if (Date.now() > deadline) return { bytes, files, complete: false };
    const folder = folders.pop() as string;
    let entries: Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      // No folder yet means nothing has been saved to this disk.
      if (folder === root) return errorCode(error) === "ENOENT" ? { bytes: 0, files: 0, complete: true } : null;
      // A shop folder removed mid-count is simply gone; an unreadable one leaves the total short.
      if (errorCode(error) !== "ENOENT") complete = false;
      continue;
    }

    const found: string[] = [];
    for (const entry of entries) {
      // Uploads get random hex names; dot-files such as .gitkeep are not uploads.
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) folders.push(path.join(folder, entry.name));
      else if (entry.isFile()) found.push(path.join(folder, entry.name));
    }

    for (let start = 0; start < found.length; start += STAT_BATCH) {
      if (Date.now() > deadline) return { bytes, files, complete: false };
      await Promise.all(
        found.slice(start, start + STAT_BATCH).map(async (file) => {
          try {
            const info = await lstat(file);
            bytes += info.size;
            files += 1;
          } catch (error) {
            if (errorCode(error) !== "ENOENT") complete = false;
          }
        }),
      );
    }
  }

  return { bytes, files, complete };
}

/** Free space on the disk holding the uploads folder (or, without one, the app's own disk). */
async function readDiskSpace(uploadsRoot: string): Promise<DiskSpace> {
  const targets = [
    { folder: uploadsRoot, measured: "uploads" as const },
    { folder: process.cwd(), measured: "app" as const },
  ];
  for (const { folder, measured } of targets) {
    try {
      const info = await statfs(folder);
      const totalBytes = info.blocks * info.bsize;
      const freeBytes = info.bavail * info.bsize;
      if (!(totalBytes > 0)) return null;
      return { totalBytes, freeBytes, measured, low: freeBytes < totalBytes * LOW_DISK_SHARE };
    } catch {
      // Try the next folder.
    }
  }
  return null;
}

/** Bytes and counts per storage place, for uploads and automatic product photos together. */
async function readStoredFiles(): Promise<StoredFiles> {
  try {
    const [attachments, photos] = await Promise.all([
      db.attachment.groupBy({
        by: ["storage"],
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      db.automaticProductPhoto.groupBy({
        by: ["storage"],
        where: { storage: { not: null } },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
    ]);
    const places = new Map<string, { storage: string; files: number; bytes: number }>();
    for (const row of [...attachments, ...photos]) {
      const storage = row.storage ?? "local";
      const place = places.get(storage) ?? { storage, files: 0, bytes: 0 };
      place.files += row._count._all;
      place.bytes += row._sum.sizeBytes ?? 0;
      places.set(storage, place);
    }
    return [...places.values()].sort((a, b) => b.bytes - a.bytes);
  } catch {
    return null;
  }
}

/**
 * Which build is running and since when. The build is only described on a
 * production server: a development copy can hold an older build's files.
 */
async function readRuntime(now: Date): Promise<AppRuntime> {
  const production = process.env.NODE_ENV === "production";
  let buildId: string | null = null;
  let builtAt: Date | null = null;
  if (production) {
    const file = path.join(process.cwd(), ".next", "BUILD_ID");
    try {
      const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      buildId = BUILD_ID_SHAPE.test(text.trim()) ? text.trim() : null;
      builtAt = info.mtime;
    } catch {
      // Not started from a build folder; there is nothing to describe.
    }
  }
  return {
    production,
    buildId,
    builtAt,
    startedAt: new Date(now.getTime() - Math.round(process.uptime() * 1000)),
    nodeVersion: process.version,
    storageDriver: storageDriverName(),
  };
}

/** Remove common credential forms before displaying provider error text. */
function redactOperationalError(value: string | null | undefined): string {
  if (!value?.trim()) return "No error detail was recorded.";

  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g, "[redacted key]")
    .replace(
      /((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    )
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s/]+@/gi,
      "$1[redacted]@",
    )
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

async function readPlatformFailures(): Promise<FailureFeed> {
  const [webhooks, integrations, shops] = await Promise.all([
    db.webhookDelivery
      .findMany({
        where: { status: "failed" },
        orderBy: [{ lastAttemptAt: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          event: true,
          lastError: true,
          responseCode: true,
          attempts: true,
          lastAttemptAt: true,
          createdAt: true,
          shop: { select: { name: true } },
        },
      })
      .then((rows) => ({ rows, unavailable: false }))
      .catch(() => ({ rows: [], unavailable: true })),
    db.integrationConnection
      .findMany({
        where: { status: "error" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          provider: true,
          lastError: true,
          updatedAt: true,
          shop: { select: { name: true } },
        },
      })
      .then((rows) => ({ rows, unavailable: false }))
      .catch(() => ({ rows: [], unavailable: true })),
    db.shop
      .findMany({
        where: { stripeWebhookError: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          stripeWebhookError: true,
          stripeWebhookAt: true,
          updatedAt: true,
        },
      })
      .then((rows) => ({ rows, unavailable: false }))
      .catch(() => ({ rows: [], unavailable: true })),
  ]);

  const rows: PlatformFailure[] = [
    ...webhooks.rows.map((row) => ({
      id: `webhook-${row.id}`,
      kind: "webhook" as const,
      title: `Webhook delivery · ${row.event}`,
      shopName: row.shop.name,
      message: redactOperationalError(
        row.lastError ??
          `Delivery failed${row.responseCode ? ` with HTTP ${row.responseCode}` : ""} after ${row.attempts} attempts.`,
      ),
      occurredAt: row.lastAttemptAt ?? row.createdAt,
    })),
    ...integrations.rows.map((row) => ({
      id: `integration-${row.id}`,
      kind: "integration" as const,
      title: `${row.provider} integration error`,
      shopName: row.shop.name,
      message: redactOperationalError(row.lastError),
      occurredAt: row.updatedAt,
    })),
    ...shops.rows.map((row) => ({
      id: `payments-${row.id}`,
      kind: "payments" as const,
      title: "Stripe webhook setup error",
      shopName: row.name,
      message: redactOperationalError(row.stripeWebhookError),
      occurredAt: row.stripeWebhookAt ?? row.updatedAt,
    })),
  ];

  rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return {
    rows: rows.slice(0, 16),
    unavailableSources: [
      webhooks.unavailable ? "webhook deliveries" : null,
      integrations.unavailable ? "accounting integrations" : null,
      shops.unavailable ? "Stripe webhook setup" : null,
    ].filter((value): value is string => value !== null),
  };
}

/**
 * Single secure entry point for the System health data. The access check
 * completes before any reading starts (database, uploads folder, disk), so
 * another server route cannot accidentally reuse an unguarded global-read
 * helper. Shop counts and the audit trail live in lib/platform-shops.ts
 * (Overview, Shops, Activity).
 *
 * Everything here is read from inside the app itself, so it holds wherever the
 * app runs (the home server's Docker container in production). Provider
 * dashboards are not consulted: the Cloudflare Worker and PlanetScale readings
 * went with that hosting, retired on 30 Sep 2026.
 */
export async function readPlatformConsole() {
  const admin = await requirePlatformAdmin();
  const now = new Date();
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const [database, uploads, disk, storedFiles, runtime, failures] = await Promise.all([
    readDatabaseStats(),
    readUploadsFolder(uploadsRoot),
    readDiskSpace(uploadsRoot),
    readStoredFiles(),
    readRuntime(now),
    readPlatformFailures(),
  ]);

  return { admin, now, database, uploads, disk, storedFiles, runtime, failures };
}
