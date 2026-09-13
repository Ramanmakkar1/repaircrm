import "server-only";

import { db } from "@/lib/db";
import { platformSetting, requirePlatformAdmin } from "@/lib/platform-admin";
import {
  parsePlanetScaleMetrics,
  type PlanetScaleMetricsSnapshot,
} from "@/lib/planetscale-metrics";

export type DatabaseStats = {
  storageBytes: number;
  activeSessions: number;
  totalSessions: number;
  maxConnections: number;
} | null;

export type WorkerMetrics = {
  kind: "available" | "unavailable";
  reason?: string;
  requests?: number;
  errors?: number;
  cpuTimeP99?: number | null;
  memoryUsageP99Bytes?: number | null;
  sampleAt?: string | null;
};

export type PlanetScaleMetrics =
  | ({ kind: "available" } & PlanetScaleMetricsSnapshot)
  | { kind: "unavailable"; reason: string };

export type PlatformCounts = {
  shops: number | null;
  staff: number | null;
  customers: number | null;
  tickets: number | null;
  invoices: number | null;
};

export type StorageFootprint = {
  r2RecordedBytes: number | null;
  r2Objects: number | null;
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

export type PlatformAuditEvent = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
  shopName: string;
  actorName: string | null;
};

export type AuditFeed = {
  rows: PlatformAuditEvent[];
  unavailable: boolean;
};

async function safeCount(query: () => Promise<number>): Promise<number | null> {
  try {
    return await query();
  } catch {
    return null;
  }
}

async function readPlatformCounts(): Promise<PlatformCounts> {
  const [shops, staff, customers, tickets, invoices] = await Promise.all([
    safeCount(() => db.shop.count()),
    safeCount(() => db.user.count({ where: { active: true } })),
    safeCount(() => db.customer.count()),
    safeCount(() => db.ticket.count()),
    safeCount(() => db.invoice.count()),
  ]);

  return { shops, staff, customers, tickets, invoices };
}

/** Attachment rows are the billable objects RepairPilot intentionally owns. */
async function readStorageFootprint(): Promise<StorageFootprint> {
  try {
    const result = await db.attachment.aggregate({
      where: { storage: "r2" },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    });
    return {
      r2RecordedBytes: result._sum.sizeBytes ?? 0,
      r2Objects: result._count._all,
    };
  } catch {
    return { r2RecordedBytes: null, r2Objects: null };
  }
}

/** PostgreSQL size and live sessions from the database itself, via Hyperdrive. */
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Read-only primary-cluster CPU, memory, and disk metrics from PlanetScale. */
async function readPlanetScaleMetrics(): Promise<PlanetScaleMetrics> {
  const tokenId = platformSetting("PLANETSCALE_SERVICE_TOKEN_ID");
  const token = platformSetting("PLANETSCALE_SERVICE_TOKEN");
  const organization = platformSetting("PLANETSCALE_ORGANIZATION");
  const database = platformSetting("PLANETSCALE_DATABASE");
  const branch = platformSetting("PLANETSCALE_BRANCH");

  if (!tokenId || !token || !organization || !database || !branch) {
    return {
      kind: "unavailable",
      reason:
        "PlanetScale CPU, memory, and volume metrics require a read-only service token scoped to this database branch.",
    };
  }

  const base =
    `https://api.planetscale.com/v1/organizations/${encodeURIComponent(organization)}` +
    `/databases/${encodeURIComponent(database)}/branches/${encodeURIComponent(branch)}`;
  const timeSeriesUrl = new URL(`${base}/metrics`);
  timeSeriesUrl.searchParams.set(
    "metrics",
    [
      "planetscale_primary_pods_cpu_util_percentages",
      "planetscale_primary_memory_rss_bytes",
      "planetscale_primary_pods_mem_util_percentages",
      "planetscale_storage_usage_bytes",
      "planetscale_volume_usage_percentages",
    ].join(","),
  );
  timeSeriesUrl.searchParams.set("period", "15m");

  const instantUrl = new URL(`${base}/metrics/instant`);
  instantUrl.searchParams.set("metrics", "planetscale_volume_capacity_bytes");

  try {
    const headers = {
      authorization: `${tokenId}:${token}`,
      accept: "application/json",
    };
    const [timeSeriesResponse, instantResponse] = await Promise.all([
      fetch(timeSeriesUrl, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }),
      fetch(instantUrl, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      }),
    ]);

    if (!timeSeriesResponse.ok || !instantResponse.ok) {
      return {
        kind: "unavailable",
        reason:
          "PlanetScale did not return metrics. Check the service token’s read_branch permission and database settings.",
      };
    }

    const [timeSeriesPayload, instantPayload]: [unknown, unknown] =
      await Promise.all([timeSeriesResponse.json(), instantResponse.json()]);
    const metrics = parsePlanetScaleMetrics(timeSeriesPayload, instantPayload);
    if (
      metrics.cpuPercent === null &&
      metrics.memoryRssBytes === null &&
      metrics.memoryUtilPercent === null &&
      metrics.storageUsageBytes === null &&
      metrics.volumeUsagePercent === null
    ) {
      return {
        kind: "unavailable",
        reason: "PlanetScale has not published resource metrics for this branch yet.",
      };
    }
    return { kind: "available", ...metrics };
  } catch {
    return {
      kind: "unavailable",
      reason: "PlanetScale metrics could not be reached. Check the service token and retry.",
    };
  }
}

/** Read-only one-hour Cloudflare Workers metrics; no mutations or provisioning. */
async function readCloudflareWorkerMetrics(): Promise<WorkerMetrics> {
  const token = platformSetting("CF_ANALYTICS_API_TOKEN");
  const accountId = platformSetting("CLOUDFLARE_ACCOUNT_ID");
  const workerName = platformSetting("CF_WORKER_NAME") || "repairpilot";

  if (!token || !accountId) {
    const missing = [
      !token ? "CF_ANALYTICS_API_TOKEN" : null,
      !accountId ? "CLOUDFLARE_ACCOUNT_ID" : null,
    ].filter((value): value is string => value !== null);
    return {
      kind: "unavailable",
      reason: `Set ${missing.join(" and ")} to read Cloudflare Worker metrics.`,
    };
  }

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const quote = (value: string) => JSON.stringify(value);
  const query = `query {
    viewer {
      accounts(filter: { accountTag: ${quote(accountId)} }) {
        workersInvocationsAdaptive(
          filter: {
            scriptName: ${quote(workerName)},
            datetime_geq: ${quote(start.toISOString())},
            datetime_leq: ${quote(now.toISOString())}
          },
          limit: 1000
        ) {
          sum { requests errors }
          quantiles { cpuTimeP99 memoryUsageBytesP99 }
          dimensions { datetime }
        }
      }
    }
  }`;

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        kind: "unavailable",
        reason:
          "Cloudflare Analytics did not return metrics. Check the token’s Account Analytics: Read permission and the account and Worker names.",
      };
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.data)) {
      return {
        kind: "unavailable",
        reason:
          "Cloudflare Analytics did not return metrics. Check the token’s Account Analytics: Read permission and the account and Worker names.",
      };
    }

    const viewer = payload.data.viewer;
    const accounts = isRecord(viewer) ? viewer.accounts : null;
    const account = Array.isArray(accounts) ? accounts[0] : null;
    const rawRows = isRecord(account) ? account.workersInvocationsAdaptive : null;
    const rows = Array.isArray(rawRows)
      ? rawRows.filter(isRecord)
      : [];

    if (rows.length === 0) {
      const errors = payload.errors;
      return {
        kind: "unavailable",
        reason:
          Array.isArray(errors) && errors.length > 0
            ? "Cloudflare Analytics could not read this Worker’s metrics. Check the account ID, Worker name, and Account Analytics: Read permission."
            : "No Worker metrics were reported for the past hour.",
      };
    }

    const totals = rows.reduce<{ requests: number; errors: number }>(
      (sum, row) => {
        const values = isRecord(row.sum) ? row.sum : {};
        sum.requests += numeric(values.requests) ?? 0;
        sum.errors += numeric(values.errors) ?? 0;
        return sum;
      },
      { requests: 0, errors: 0 },
    );

    const latest = rows
      .map((row) => {
        const dimensions = isRecord(row.dimensions) ? row.dimensions : {};
        return {
          row,
          datetime:
            typeof dimensions.datetime === "string" ? dimensions.datetime : null,
        };
      })
      .sort((a, b) => (b.datetime ?? "").localeCompare(a.datetime ?? ""))[0];
    const quantiles = isRecord(latest?.row.quantiles) ? latest.row.quantiles : {};

    const cpuTimeMicros = numeric(quantiles.cpuTimeP99);

    return {
      kind: "available",
      ...totals,
      // Workers Analytics returns cpuTime quantiles in microseconds. Convert
      // at the API boundary because the operations UI labels this value in ms.
      cpuTimeP99: cpuTimeMicros === null ? null : cpuTimeMicros / 1_000,
      memoryUsageP99Bytes: numeric(quantiles.memoryUsageBytesP99),
      sampleAt: latest?.datetime ?? null,
    };
  } catch {
    return {
      kind: "unavailable",
      reason:
        "Cloudflare Analytics could not be reached. Check the token and retry later.",
    };
  }
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

async function readPlatformAudit(): Promise<AuditFeed> {
  try {
    // Intentionally account-wide: callers must first pass requirePlatformAdmin.
    // Meta and IP fields are omitted to keep this feed to operational context.
    const rows = await db.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 18,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        createdAt: true,
        shop: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    return {
      rows: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        summary: row.summary,
        createdAt: row.createdAt,
        shopName: row.shop.name,
        actorName: row.user?.name ?? null,
      })),
      unavailable: false,
    };
  } catch {
    return { rows: [], unavailable: true };
  }
}

/**
 * Single secure entry point for the console data. The access check completes
 * before any cross-shop query starts, so another server route cannot
 * accidentally reuse an unguarded global-read helper.
 */
export async function readPlatformConsole() {
  const admin = await requirePlatformAdmin();
  const [counts, storage, database, databaseMetrics, worker, failures, audit] =
    await Promise.all([
    readPlatformCounts(),
    readStorageFootprint(),
    readDatabaseStats(),
    readPlanetScaleMetrics(),
    readCloudflareWorkerMetrics(),
    readPlatformFailures(),
    readPlatformAudit(),
    ]);

  return {
    admin,
    counts,
    storage,
    database,
    databaseMetrics,
    worker,
    failures,
    audit,
    accountId: platformSetting("CLOUDFLARE_ACCOUNT_ID"),
    workerName: platformSetting("CF_WORKER_NAME") || "repairpilot",
    monthlyBudgetUsd: Math.max(
      5,
      Number(platformSetting("PLATFORM_MONTHLY_BUDGET_USD")) || 10,
    ),
  };
}
