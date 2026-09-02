"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { clockInAction, clockOutAction } from "./actions";
import { formatClock, formatHours } from "./meta";

/**
 * The one control every member of staff uses on this page: a single big button
 * that says what pressing it will do.
 *
 * The ticker is the only client-side clock on the page. It starts from the
 * server's own `openedSince` and counts up from there, so the number on screen
 * is the server's truth plus elapsed wall time — never a second opinion about
 * when the shift started.
 */
export function ClockCard({
  openSinceISO,
  todaySeconds,
  weekSeconds,
}: {
  /** ISO start of the running shift, or null when clocked out. */
  openSinceISO: string | null;
  /** Completed + running seconds today, as of the render. */
  todaySeconds: number;
  weekSeconds: number;
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

  // While clocked out the ticker is stopped, so its last value is stale — the
  // render below only ever reads it in the running branch.
  const seconds = elapsed ?? 0;

  async function toggle() {
    setBusy(true);
    const result = openSinceISO ? await clockOutAction() : await clockInAction();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      // Somebody else's tab (or a second device) moved the clock — re-read
      // rather than leaving this one showing a state that is no longer true.
      router.refresh();
      return;
    }
    toast.success(openSinceISO ? "Clocked out." : "Clocked in.");
    router.refresh();
  }

  const running = openSinceISO !== null;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface px-6 py-7 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
          {running ? "On the clock" : "Clocked out"}
        </span>
        <span className="font-mono text-5xl font-bold leading-none tabular-nums tracking-tight text-foreground">
          {running ? formatClock(seconds) : formatHours(todaySeconds)}
        </span>
        <span className="text-[13.5px] text-muted-foreground">
          {running
            ? `Since ${new Date(openSinceISO).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${formatHours(todaySeconds + seconds)} today`
            : `${formatHours(todaySeconds)} today · ${formatHours(weekSeconds)} this week`}
        </span>
      </div>

      <Button
        size="lg"
        variant={running ? "outline" : "default"}
        disabled={busy}
        onClick={toggle}
        className="h-16 w-full px-8 text-lg sm:w-auto"
      >
        {running ? <LogOut /> : <LogIn />}
        {busy ? "Saving…" : running ? "Clock out" : "Clock in"}
      </Button>
    </div>
  );
}
