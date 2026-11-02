import {
  Activity,
  ArrowUpRight,
  Database,
  Gauge,
  HardDrive,
  ShieldCheck,
} from "lucide-react";

import { ConsoleShell } from "@/components/platform/console-shell";
import { PageTitle } from "@/components/platform/console-ui";
import { readPlatformConsole } from "@/lib/platform-console-data";

export const metadata = { title: "System health · Repairs helper" };

function countLabel(value: number | null): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(scaled)} ${units[unit]}`;
}

function formatTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function formatCpu(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} ms`;
}

function formatMemory(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const mib = value / (1024 * 1024);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(mib)} MiB`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function SectionTitle({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/**
 * The technical readings, for whoever looks after the servers: database,
 * runtime, persistent failures and provider costs. Shop numbers live on the
 * Overview and Shops tabs, and the audit trail on Activity.
 */
export default async function SystemHealthPage() {
  // The data loader authorizes the operator (lib/platform-admin.ts) before any cross-shop read.
  const {
    admin,
    storage,
    database,
    databaseMetrics,
    worker,
    failures,
    accountId,
    workerName,
    monthlyBudgetUsd,
  } = await readPlatformConsole();
  const knownMonthlyBaseUsd = 5;
  const budgetUse = Math.min(
    100,
    Math.round((knownMonthlyBaseUsd / monthlyBudgetUsd) * 100),
  );
  const connectionUse = database?.maxConnections
    ? Math.min(
        100,
        Math.round((database.totalSessions / database.maxConnections) * 100),
      )
    : 0;

  return (
    <ConsoleShell admin={admin} current="system">
      <div>
        <PageTitle
          title="System health"
          intro="Technical readings for whoever looks after the servers: database health, runtime metrics, saved failures and provider costs."
        >
          <p className="inline-flex items-center gap-2 text-xs text-faint-foreground">
            <Activity aria-hidden="true" className="size-3.5" />
            Snapshot · {formatTime(new Date())}
          </p>
        </PageTitle>

        <section aria-label="Database and Worker health" className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.15fr]">
          <article className="overflow-hidden rounded-lg border border-[#292c31] bg-[#111214] text-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/55">PostgreSQL · Hyperdrive</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Database health</h2>
              </div>
              <Database aria-hidden="true" className="mt-1 size-5 text-white/70" />
            </div>
            <div className="grid gap-6 px-5 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
              <div>
                <p className="text-xs text-white/55">PostgreSQL database size</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {database ? formatBytes(database.storageBytes) : "Unavailable"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  Logical database size read from PostgreSQL.
                </p>
              </div>
              <div>
                <p className="text-xs text-white/55">Primary database CPU</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {databaseMetrics.kind === "available"
                    ? formatPercent(databaseMetrics.cpuPercent)
                    : "Unavailable"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  Latest PlanetScale primary-cluster sample.
                </p>
              </div>
              <div>
                <p className="text-xs text-white/55">Primary database memory</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {databaseMetrics.kind === "available"
                    ? formatPercent(databaseMetrics.memoryUtilPercent)
                    : "Unavailable"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  {databaseMetrics.kind === "available" &&
                  databaseMetrics.memoryRssBytes !== null
                    ? `${formatMemory(databaseMetrics.memoryRssBytes)} resident memory (RSS).`
                    : "PlanetScale primary memory utilization."}
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-white/55">PlanetScale volume usage</p>
                  <p className="text-xs font-medium tabular-nums text-white/80">
                    {databaseMetrics.kind === "available"
                      ? formatPercent(databaseMetrics.volumeUsagePercent)
                      : "Unavailable"}
                  </p>
                </div>
                {databaseMetrics.kind === "available" &&
                databaseMetrics.volumeUsagePercent !== null ? (
                  <div
                    role="meter"
                    aria-label="PlanetScale volume usage percentage"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.max(
                      0,
                      Math.min(100, databaseMetrics.volumeUsagePercent),
                    )}
                    className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className="h-full rounded-full bg-white transition-[width]"
                      style={{
                        width: `${Math.max(0, Math.min(100, databaseMetrics.volumeUsagePercent))}%`,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="mt-3 h-2 rounded-full border border-dashed border-white/25"
                  />
                )}
                <p className="mt-2 text-xs text-white/55">
                  {databaseMetrics.kind === "available"
                    ? `${databaseMetrics.storageUsageBytes === null ? "Usage unavailable" : formatBytes(databaseMetrics.storageUsageBytes)} used${databaseMetrics.volumeCapacityBytes === null ? "" : ` of ${formatBytes(databaseMetrics.volumeCapacityBytes)}`}`
                    : "PlanetScale volume metrics are unavailable."}
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-white/55">Database sessions</p>
                  <p className="text-xs font-medium tabular-nums text-white/80">
                    {database ? `${database.totalSessions} / ${database.maxConnections}` : "Unavailable"}
                  </p>
                </div>
                {database ? (
                  <div
                    role="meter"
                    aria-label="PostgreSQL sessions as a share of the configured connection maximum"
                    aria-valuemin={0}
                    aria-valuemax={database.maxConnections}
                    aria-valuenow={Math.min(database.totalSessions, database.maxConnections)}
                    className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                  >
                    <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${connectionUse}%` }} />
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="mt-3 h-2 rounded-full border border-dashed border-white/25"
                  />
                )}
                <p className="mt-2 text-xs text-white/55">
                  {database ? `${database.activeSessions} active · ${connectionUse}% of max connections` : "Session activity is unavailable to this database role."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 px-5 py-3 text-xs text-white/55 sm:px-6">
              <HardDrive aria-hidden="true" className="size-3.5" />
              <span>PostgreSQL values come from SQL; host resources come from PlanetScale&apos;s read-only metrics API.</span>
            </div>
            <div className="border-t border-white/10 px-5 py-3 text-xs leading-5 text-white/65 sm:px-6">
              {databaseMetrics.kind === "available"
                ? `Provider sample${databaseMetrics.sampleAt ? ` · ${formatTime(databaseMetrics.sampleAt)}` : ""}. `
                : `${databaseMetrics.reason} `}
              View provider history in the{" "}
              <a
                href="https://app.planetscale.com/townmedialabs/repairpilot-prod/main/metrics"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-white underline underline-offset-2 hover:text-white/80"
              >
                PlanetScale metrics dashboard
              </a>
              . Metrics are operational readings, not a billing estimate.
            </div>
          </article>

          <article className="rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-faint-foreground">Cloudflare · last hour</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Worker runtime</h2>
              </div>
              <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${worker.kind === "available" ? "bg-status-resolved-bg text-status-resolved-fg" : "bg-surface-hover text-muted-foreground"}`}>
                {worker.kind === "available" ? "Connected" : "Unavailable"}
              </span>
            </div>
            {worker.kind === "available" ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <RuntimeMetric label="Requests" value={countLabel(worker.requests ?? null)} />
                  <RuntimeMetric label="Errors" value={countLabel(worker.errors ?? null)} />
                  <RuntimeMetric label="CPU p99" value={formatCpu(worker.cpuTimeP99)} />
                  <RuntimeMetric label="Isolate memory p99" value={formatMemory(worker.memoryUsageP99Bytes)} />
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Aggregated Cloudflare analytics, not a billing meter. Latest percentile sample{worker.sampleAt ? ` · ${formatTime(worker.sampleAt)}` : ""}.
                </p>
              </>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-border-strong bg-background px-4 py-3">
                <p className="text-sm font-medium text-foreground">Cloudflare runtime metrics are unavailable</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{worker.reason}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  This includes CPU time, isolate memory, request totals, and error totals. The PostgreSQL metrics above remain available independently.
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-faint-foreground">
              <span>Worker · <span className="font-medium text-muted-foreground">{workerName}</span></span>
              <span>Metrics are read-only; no resources or plans are changed.</span>
            </div>
          </article>
        </section>

        <section aria-label="Failures and billing visibility" className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_0.8fr]">
          <article className="rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
            <SectionTitle
              eyebrow="Persistent records"
              title="System failures"
              detail={`${failures.rows.length} recent record${failures.rows.length === 1 ? "" : "s"}`}
            />
            {failures.unavailableSources.length > 0 ? (
              <p className="mb-3 rounded-md border border-status-in-progress/30 bg-status-in-progress-bg px-3 py-2 text-xs leading-5 text-status-in-progress-fg">
                Some failure sources could not be read: {failures.unavailableSources.join(", ")}.
              </p>
            ) : null}
            {failures.rows.length > 0 ? (
              <ul className="divide-y divide-border">
                {failures.rows.map((failure) => (
                  <li key={failure.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-status-overdue-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-overdue-fg">{failure.kind}</span>
                        <p className="text-sm font-medium text-foreground">{failure.title}</p>
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{failure.message}</p>
                      <p className="mt-1 text-[11px] text-faint-foreground">{failure.shopName}</p>
                    </div>
                    <time className="whitespace-nowrap text-[11px] text-faint-foreground" dateTime={failure.occurredAt.toISOString()}>
                      {formatTime(failure.occurredAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : failures.unavailableSources.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-7 text-center">
                <ShieldCheck aria-hidden="true" className="mx-auto size-5 text-status-resolved" />
                <p className="mt-2 text-sm font-medium text-foreground">No persisted failures found</p>
                <p className="mt-1 text-xs text-muted-foreground">Webhook deliveries, accounting integration errors, and Stripe webhook setup errors are checked.</p>
              </div>
            ) : null}
            <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-faint-foreground">
              General Worker exceptions are not retained in Repairs helper today. Use Cloudflare Worker Logs for invocation-level details.
            </p>
          </article>

          <div className="flex flex-col gap-4">
            <article className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
              <div className="border-b border-border bg-[#111214] px-5 py-5 text-white sm:px-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/55">
                  Cost control
                </p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Monthly commitment</h2>
                    <p className="mt-1 text-xs text-white/55">Known base plans before tax or usage overage</p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatUsd(knownMonthlyBaseUsd)} <span className="text-sm font-medium text-white/50">/ {formatUsd(monthlyBudgetUsd)}</span>
                  </p>
                </div>
                <div
                  role="meter"
                  aria-label="Known monthly base plans as a share of the authorized budget"
                  aria-valuemin={0}
                  aria-valuemax={monthlyBudgetUsd}
                  aria-valuenow={knownMonthlyBaseUsd}
                  className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"
                >
                  <div className="h-full rounded-full bg-white" style={{ width: `${budgetUse}%` }} />
                </div>
              </div>

              <div className="divide-y divide-border px-5 sm:px-6">
                <PlanRow name="PlanetScale PostgreSQL" status="Active" price="$5 / month" detail="PS-5 single node · 10 GB volume cap" />
                <PlanRow
                  name="Cloudflare R2"
                  status="Active"
                  price="$0 base"
                  detail={`${storage.r2RecordedBytes === null ? "Recorded use unavailable" : `${formatBytes(storage.r2RecordedBytes)} in ${countLabel(storage.r2Objects)} object${storage.r2Objects === 1 ? "" : "s"}`} · Repairs helper stops new uploads at 8 GiB`}
                />
                <PlanRow name="Cloudflare Workers" status="Free plan" price="$0 base" detail="No paid Workers upgrade enabled" />
                <PlanRow
                  name="Cloudflare usage budget alert"
                  status="Active"
                  price="$10 threshold"
                  detail="Daily email warning to the account owner · informational alert, not a hard spending cap"
                />
                <PlanRow name="Google OAuth" status="Active" price="$0" detail="Basic profile sign-in scopes only" />
              </div>

              <div className="border-t border-border bg-background px-5 py-4 sm:px-6">
                <p className="text-xs leading-5 text-muted-foreground">
                  Repairs helper never upgrades a provider plan. R2 can still bill usage above its free operation allowances, so provider invoices remain the source of truth. Any new plan that would take the known base commitment above {formatUsd(monthlyBudgetUsd)} requires manual approval.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {accountId ? (
                    <a
                      href={`https://dash.cloudflare.com/${encodeURIComponent(accountId)}/billing/subscriptions`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      Cloudflare subscriptions <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </a>
                  ) : null}
                  <a
                    href="https://app.planetscale.com/townmedialabs/settings/billing/latest"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    PlanetScale billing <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
              </div>
            </article>

            <article id="platform-setup" className="rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
              <SectionTitle eyebrow="Deployment configuration" title="Admin & metrics setup" />
              <ol className="space-y-3 text-xs leading-5 text-muted-foreground">
                <li><span className="font-semibold text-foreground">1.</span> Operators are separate from shop accounts. Add or reset one with <code className="font-mono text-foreground">node scripts/platform-admin.mjs add &lt;email&gt;</code>; optionally set <code className="font-mono text-foreground">PLATFORM_HOST</code> so the console answers only on its own address.</li>
                <li><span className="font-semibold text-foreground">2.</span> For local development, put the list in ignored <code className="font-mono text-foreground">.env.local</code>. For Workers, set it in Cloudflare&apos;s Worker environment settings; keep administrator addresses out of source control.</li>
                <li><span className="font-semibold text-foreground">3.</span> Optional Cloudflare metrics require <code className="font-mono text-foreground">CLOUDFLARE_ACCOUNT_ID</code> and an API token scoped only to Account → Account Analytics → Read.</li>
                <li><span className="font-semibold text-foreground">4.</span> Set <code className="font-mono text-foreground">CF_ANALYTICS_API_TOKEN</code> with <code className="font-mono text-foreground">wrangler secret put CF_ANALYTICS_API_TOKEN</code>. <code className="font-mono text-foreground">CF_WORKER_NAME</code> defaults to <code className="font-mono text-foreground">repairpilot</code>.</li>
                <li><span className="font-semibold text-foreground">5.</span> PlanetScale primary CPU, memory, and storage require a service token with only <code className="font-mono text-foreground">read_branch</code> on <code className="font-mono text-foreground">repairpilot-prod</code>. Set <code className="font-mono text-foreground">PLANETSCALE_SERVICE_TOKEN_ID</code> and <code className="font-mono text-foreground">PLANETSCALE_SERVICE_TOKEN</code> as Worker secrets.</li>
                <li><span className="font-semibold text-foreground">6.</span> Rotate the PlanetScale metrics token before its expiry and give the replacement only the same branch read permission.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                <a className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href="https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/" target="_blank" rel="noreferrer">
                  Cloudflare token instructions <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
                <a className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href="https://planetscale.com/docs/api/reference/service-tokens" target="_blank" rel="noreferrer">
                  PlanetScale service tokens <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
              </div>
            </article>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 py-5 text-[11px] text-faint-foreground">
          <span>Read-only platform scope · {admin.name}</span>
          <span className="inline-flex items-center gap-1.5"><Gauge aria-hidden="true" className="size-3.5" />Data access is gated per request.</span>
        </footer>
      </div>
    </ConsoleShell>
  );
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <p className="text-[11px] font-medium text-faint-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function PlanRow({
  name,
  status,
  price,
  detail,
}: {
  name: string;
  status: string;
  price: string;
  detail: string;
}) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <span className="rounded-sm bg-status-resolved-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-resolved-fg">
            {status}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{price}</p>
    </div>
  );
}
