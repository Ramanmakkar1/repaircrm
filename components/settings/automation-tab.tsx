"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock,
  Globe,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { runJobsNowAction } from "@/app/(app)/settings/automation-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { JOB_SOURCE_LABEL, type JobsSummary } from "@/lib/jobs/types";

/**
 * Settings → Automation.
 *
 * Answers one question an operator actually asks — "are the follow-ups going
 * out, and when did that last happen?" — and gives them a button for the
 * moment the answer is "apparently not".
 *
 * Read-only apart from that button. The schedule is configured by environment
 * (JOBS_INTERVAL_MIN, CRON_SECRET) for the same reason the messaging drivers
 * are: a staging box must not be able to start billing real customers because
 * someone flipped a switch in a browser.
 */

export type AutomationConfig = {
  /** Minutes between automatic runs; 0 means the in-app timer is off. */
  intervalMin: number;
  /** Seconds before the first run after a restart. */
  firstDelayS: number;
  /** Whether CRON_SECRET is populated. Never the value. */
  cronSecretSet: boolean;
  /** Absolute URL an external scheduler should call. */
  cronUrl: string;
  /** The last run, from this shop's settings. Survives a restart. */
  lastRunAt: string | null;
  lastSummary: JobsSummary | null;
  /** Recent runs from the in-memory ring buffer. Empty after a restart. */
  recentRuns: JobsSummary[];
  /** Only an owner may press the button. */
  canRun: boolean;
};

const RunIcon = Play;

export function AutomationTab({ config }: { config: AutomationConfig }) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  // The summary from a run made in this browser session — shown in preference
  // to the stored one, because it is what the operator just asked for.
  const [justRan, setJustRan] = React.useState<JobsSummary | null>(null);

  const timerOn = config.intervalMin > 0;
  const summary = justRan ?? config.lastSummary;
  const lastRunAt = justRan?.startedAt ?? config.lastRunAt;

  async function runNow() {
    setRunning(true);
    try {
      const result = await runJobsNowAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setJustRan(result.summary);

      if (result.summary.skipped) {
        toast.message("A run was already in progress — nothing to do.");
      } else if (result.summary.errors.length > 0) {
        toast.warning("Jobs ran, with problems. See the summary below.");
      } else {
        toast.success("Jobs ran.");
      }

      // Pull in anything the run created (invoices, campaign sends).
      router.refresh();
    } catch {
      toast.error("Could not run the jobs. Check the server log.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          icon={ICONS.automation}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Automatic runs
              <StatusPill
                size="sm"
                tone={timerOn ? "success" : "neutral"}
                label={timerOn ? `Every ${config.intervalMin} min` : "Timer off"}
              />
            </span>
          }
          description={
            timerOn
              ? `Follow-ups and recurring invoices run themselves every ${config.intervalMin} minutes while the app is running.`
              : "The built-in timer is switched off. Nothing runs on its own unless an outside scheduler calls the web address below."
          }
        />

        <CardContent className="flex flex-col gap-4">
          <VarRow name="JOBS_INTERVAL_MIN" value={String(config.intervalMin)} on={timerOn} />
          {timerOn ? (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              After a restart the first run waits {config.firstDelayS} seconds
              (<Env>JOBS_FIRST_DELAY_S</Env>), so a busy boot is not spent on
              billing. Set <Env>JOBS_INTERVAL_MIN</Env> to <code>0</code> to
              turn the timer off — for example when an outside scheduler is
              already calling the address below.
            </p>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Set <Env>JOBS_INTERVAL_MIN</Env> to a number of minutes and
              restart the app to switch it back on.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          icon={Globe}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Outside scheduler
              <StatusPill
                size="sm"
                tone={config.cronSecretSet ? "success" : "neutral"}
                label={config.cronSecretSet ? "Open" : "Closed"}
              />
            </span>
          }
          description={
            config.cronSecretSet
              ? "A cron service or uptime checker can trigger a run by calling this address."
              : "Turned off. Anyone could start a run if this address had no password, so it stays closed until one is set."
          }
        />

        <CardContent className="flex flex-col gap-4">
          <code className="w-fit max-w-full overflow-x-auto rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
            {config.cronUrl}
          </code>

          <VarRow
            name="CRON_SECRET"
            value={config.cronSecretSet ? "set" : "not set"}
            on={config.cronSecretSet}
          />

          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            {config.cronSecretSet ? (
              <>
                Send the secret as{" "}
                <Env>Authorization: Bearer &lt;secret&gt;</Env>, or add{" "}
                <Env>?secret=…</Env> to the address if your scheduler cannot
                send headers. It answers with a summary of what ran.
              </>
            ) : (
              <>
                Set <Env>CRON_SECRET</Env> in the server environment to open it.
                Until then the address answers{" "}
                <span className="font-medium text-foreground">
                  503 — cron endpoint disabled
                </span>
                .
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          icon={Clock}
          title="Last run"
          description={<LastRunLabel iso={lastRunAt} source={summary?.source} />}
          action={
            config.canRun ? (
              <Button onClick={runNow} disabled={running}>
                {running ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RunIcon aria-hidden />
                )}
                {running ? "Running…" : "Run all jobs now"}
              </Button>
            ) : null
          }
        />

        <CardContent className="flex flex-col gap-4">
          {summary ? (
            <SummaryBlock summary={summary} />
          ) : (
            <EmptyState
              icon={ICONS.automation}
              title="Nothing has run yet"
              hint={
                config.canRun
                  ? "Recurring invoices, review requests and campaign sends all happen here. Press Run all jobs now to try it."
                  : "Recurring invoices, review requests and campaign sends all happen here. An owner can start a run by hand."
              }
              className="rounded-md border border-dashed border-border py-10"
            />
          )}
        </CardContent>
      </Card>

      {config.recentRuns.length > 1 ? (
        <Card>
          <CardHeader
            icon={ACTIONS.retry}
            title="Recent runs"
            description={`The last ${config.recentRuns.length} runs since the app started. This list is not saved — a restart clears it, while the “last run” above is kept.`}
          />
          <CardContent className="flex flex-col gap-2">
            {config.recentRuns.map((run, index) => (
              <div
                key={`${run.startedAt}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-hover px-3 py-2 text-[13px]"
              >
                <span className="font-medium text-foreground">
                  <Stamp iso={run.startedAt} />
                </span>
                <span className="text-muted-foreground">
                  {JOB_SOURCE_LABEL[run.source]}
                </span>
                <span className="font-mono text-muted-foreground">
                  {run.skipped
                    ? `skipped (${run.skipped})`
                    : `${run.recurring.created} inv · ${run.campaigns.sent} sent · ${run.ms}ms`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function SummaryBlock({ summary }: { summary: JobsSummary }) {
  if (summary.skipped) {
    return (
      <p className="rounded-md bg-surface-hover px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
        {summary.skipped === "in-process"
          ? "A run was already going, so this one stopped rather than doing the work twice."
          : "Another run had just started, so this one stood down."}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Invoices created" value={summary.recurring.created} />
        <Stat label="Messages queued" value={summary.campaigns.queued} />
        <Stat label="Messages sent" value={summary.campaigns.sent} />
        <Stat
          label="Send failures"
          value={summary.campaigns.failed}
          alarming={summary.campaigns.failed > 0}
        />
      </div>

      {/* Only shown once a schedule has auto-charge turned on. A permanent
          "0 cards charged" on every shop that never uses it is noise. */}
      {(summary.charges?.attempted ?? 0) > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cards charged" value={summary.charges?.succeeded ?? 0} />
          <Stat
            label="Cards declined"
            value={summary.charges?.failed ?? 0}
            alarming={(summary.charges?.failed ?? 0) > 0}
          />
        </div>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        {summary.shops} shop{summary.shops === 1 ? "" : "s"} checked ·{" "}
        {summary.sla?.breached ?? 0} overdue ticket
        {(summary.sla?.breached ?? 0) === 1 ? "" : "s"} flagged ·{" "}
        {summary.tokensPurged} expired portal link
        {summary.tokensPurged === 1 ? "" : "s"} and{" "}
        {summary.scanSessionsPurged ?? 0} phone pairing
        {(summary.scanSessionsPurged ?? 0) === 1 ? "" : "s"} cleaned up · took{" "}
        {summary.ms}ms
      </p>

      {summary.errors.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md bg-status-overdue-bg px-4 py-3">
          <span className="flex items-center gap-2 text-[13.5px] font-semibold text-status-overdue-fg">
            <AlertTriangle className="size-4 shrink-0" />
            {summary.errors.length} problem
            {summary.errors.length === 1 ? "" : "s"} during the run
          </span>
          <ul className="flex flex-col gap-1">
            {summary.errors.map((error, index) => (
              <li
                key={index}
                className="text-[13px] leading-relaxed text-status-overdue-fg"
              >
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  alarming = false,
}: {
  label: string;
  value: number;
  alarming?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-hover px-3 py-2.5">
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          alarming ? "text-status-overdue-fg" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function VarRow({
  name,
  value,
  on,
}: {
  name: string;
  value: string;
  on: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {on ? (
        <CheckCircle2 className="size-4 shrink-0 text-status-resolved" />
      ) : (
        <CircleAlert className="size-4 shrink-0 text-status-in-progress" />
      )}
      <Env>{name}</Env>
      <code
        className={cn(
          "rounded-full px-3 py-1 font-mono text-[13px] font-semibold",
          on
            ? "bg-status-resolved-bg text-status-resolved-fg"
            : "bg-surface-hover text-muted-foreground",
        )}
      >
        {value}
      </code>
    </div>
  );
}

function LastRunLabel({
  iso,
  source,
}: {
  iso: string | null;
  source?: JobsSummary["source"];
}) {
  if (!iso) return <>Never — nothing has run on this server yet.</>;
  return (
    <>
      <Stamp iso={iso} />
      {source ? ` · ${JOB_SOURCE_LABEL[source]}` : null}
    </>
  );
}

/**
 * "3 minutes ago", but only once the browser has mounted.
 *
 * The server and the browser render this component at measurably different
 * moments, so a relative time computed during SSR is a guaranteed hydration
 * mismatch. The absolute timestamp is rendered first — correct and identical
 * on both sides — and the relative form is swapped in afterwards.
 */
function Stamp({ iso }: { iso: string }) {
  const mounted = useMounted();

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <>unknown</>;

  return (
    <>
      {mounted
        ? `${formatDistanceToNow(date)} ago`
        : format(date, "d MMM yyyy, h:mm a")}
    </>
  );
}

/** The "have we mounted?" store never changes again, so nothing subscribes. */
const subscribeNever = () => () => {};

/**
 * `false` on the server and for the very first client render, `true` from the
 * moment React has hydrated.
 *
 * Read as an external store rather than flipped by an effect: same single
 * re-render, without a setState in an effect body to cascade one more.
 */
function useMounted(): boolean {
  return React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
      {children}
    </code>
  );
}
