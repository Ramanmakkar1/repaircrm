"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  clockInAction,
  clockOutAction,
} from "@/app/(app)/time-clock/actions";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { clockPanelCopy } from "./shift-meta";

/**
 * The one control every member of staff uses on this page: a very large
 * button that says what pressing it will do. One button per state - Clock in
 * while you are clocked out, Clock out while you are running - and nothing
 * else competes with it.
 *
 * The ticker is the only client-side clock on the page. It starts from the
 * server's own `openSinceISO` and counts up from there, so the number on screen
 * is the server's truth plus elapsed wall time - never a second opinion about
 * when the shift started.
 */
export function ClockPanel({
  openSinceISO,
  openSinceLabel,
  todaySeconds,
  weekSeconds,
  forgotSince = null,
  ownerFixes = false,
}: {
  /** ISO start of the running shift, or null when clocked out. */
  openSinceISO: string | null;
  /**
   * "9:14 AM", already formatted against the shop's clock on the server. The
   * browser must not format it itself: the two sides can sit in different time
   * zones, and React reports the difference as a hydration mismatch.
   */
  openSinceLabel: string | null;
  /** Completed seconds today, as of the render. */
  todaySeconds: number;
  weekSeconds: number;
  /**
   * "Wed Sep 30, 9:02 AM" when the running shift looks forgotten (it started
   * on an earlier day, or has run 14 hours): said in words above the button.
   */
  forgotSince?: string | null;
  /** The viewer can fix shifts themselves (an owner), below in the team's week. */
  ownerFixes?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  // null until the ticker's first tick after mount: computing elapsed time from
  // `Date.now()` during render would differ between the server HTML and the
  // first client paint, which React reports as a hydration mismatch.
  const [elapsed, setElapsed] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!openSinceISO) return;
    const started = new Date(openSinceISO).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [openSinceISO]);

  const running = openSinceISO !== null;

  async function toggle() {
    setBusy(true);
    const result = running ? await clockOutAction() : await clockInAction();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      // Somebody else's tab (or a second device) moved the clock - re-read
      // rather than leaving this one showing a state that is no longer true.
      router.refresh();
      return;
    }
    toast.success(running ? "Clocked out." : "Clocked in.");
    router.refresh();
  }

  // While clocked out the ticker is stopped, so its last value is stale - the
  // copy only reads it in the running branch.
  const copy = clockPanelCopy({
    running,
    openSinceLabel,
    todaySeconds,
    weekSeconds,
    elapsedSeconds: running ? (elapsed ?? 0) : 0,
  });

  return (
    <section
      aria-label="Your clock"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3">
        <StatusPill
          tone={running ? "active" : "neutral"}
          label={copy.status}
          className="px-2.5 py-1.5 text-[14px]"
        />
        <div className="flex flex-col gap-1.5">
          <span className="rf-num font-mono text-5xl font-bold leading-none tabular-nums tracking-tight text-foreground sm:text-6xl">
            {copy.figure}
          </span>
          <span className="text-base text-muted-foreground">{copy.caption}</span>
        </div>
      </div>

      {running && forgotSince ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-status-overdue/40 bg-status-overdue-bg px-4 py-3 text-[15px] font-medium text-status-overdue-fg"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            Still clocked in since {forgotSince}. Forgot to clock out?{" "}
            {ownerFixes
              ? "Use Fix this shift in the week below to put the right time in."
              : "Clock out now, then ask the owner to put the right time in."}
          </span>
        </p>
      ) : null}

      <Button
        size="lg"
        disabled={busy}
        onClick={toggle}
        className="h-20 w-full rounded-2xl text-2xl [&_svg]:size-7"
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : running ? (
          <ACTIONS.clockOut />
        ) : (
          <ACTIONS.clockIn />
        )}
        {busy ? copy.busyAction : copy.action}
      </Button>
    </section>
  );
}
