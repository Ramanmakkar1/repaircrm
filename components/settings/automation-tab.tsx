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
  Play,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { runJobsNowAction } from "@/app/(app)/settings/automation-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
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
        <CardHeader className="flex-row items-center gap-3.5">
          <IconChip
            icon={RefreshCw}
            className={
              timerOn
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground"
            }
          />
          <div className="flex flex-col gap-1">
            <CardTitle>Automatic runs</CardTitle>
            <CardDescription>
              {timerOn
                ? `Follow-ups and recurring invoices run themselves every ${config.intervalMin} minutes while the app is running.`
                : "The built-in timer is switched off. Nothing runs on its own unless an outside scheduler calls the web address below."}
            </CardDescription>
          </div>
        </CardHeader>

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
        <CardHeader className="flex-row items-center gap-3.5">
          <IconChip
            icon={Globe}
            className={
              config.cronSecretSet
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground"
            }
          />
          <div className="flex flex-col gap-1">
            <CardTitle>Outside scheduler</CardTitle>
            <CardDescription>
              {config.cronSecretSet
                ? "A cron service or uptime checker can trigger a run by calling this address."
                : "Turned off. Anyone could start a run if this address had no password, so it stays closed until one is set."}
            </CardDescription>
          </div>
        </CardHeader>

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
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <IconChip icon={Clock} className="bg-surface-hover text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <CardTitle>Last run</CardTitle>
              <CardDescription>
                <LastRunLabel iso={lastRunAt} source={summary?.source} />
              </CardDescription>
            </div>
          </div>

          {config.canRun ? (
            <Button onClick={runNow} disabled={running}>
              <Play /> {running ? "Running…" : "Run all jobs now"}
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {summary ? <SummaryBlock summary={summary} /> : (
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Nothing has run yet on this server.
              {config.canRun ? " Use the button above to try it." : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {config.recentRuns.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>
              The last {config.recentRuns.length} runs since the app started.
              This list is not saved — a restart clears it, while the “last run”
              above is kept.
            </CardDescription>
          </CardHeader>
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

      <p className="text-[13px] text-muted-foreground">
        {summary.shops} shop{summary.shops === 1 ? "" : "s"} checked ·{" "}
        {summary.tokensPurged} expired portal link
        {summary.tokensPurged === 1 ? "" : "s"} cleaned up · took {summary.ms}ms
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
  const [relative, setRelative] = React.useState<string | null>(null);

  React.useEffect(() => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    setRelative(`${formatDistanceToNow(date)} ago`);
  }, [iso]);

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <>unknown</>;

  return <>{relative ?? format(date, "d MMM yyyy, h:mm a")}</>;
}

function Env({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[13px] font-semibold text-foreground">
      {children}
    </code>
  );
}
