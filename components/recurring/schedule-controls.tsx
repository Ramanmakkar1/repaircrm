"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, PlayCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  runDueRecurringInvoices,
  runRecurringInvoice,
  setScheduleActiveAction,
} from "@/app/(app)/invoices/recurring/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * The three live controls on the recurring screens.
 *
 * All of them call their Server Action directly and await the result, rather
 * than posting a form — each one reports something the operator needs to read
 * ("invoice #1043 created", "3 generated"), which a plain form submit has
 * nowhere to put.
 */

/** Inline on/off toggle on a schedule card. Optimistic, reverts on failure. */
export function ScheduleActiveSwitch({
  scheduleId,
  active,
  scheduleName,
}: {
  scheduleId: string;
  active: boolean;
  scheduleName: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(active);
  const [busy, setBusy] = React.useState(false);

  // The server is the source of truth: if the page re-renders with a different
  // value (another tab, a revalidate), follow it rather than pinning stale state.
  React.useEffect(() => setChecked(active), [active]);

  async function toggle(next: boolean) {
    setChecked(next);
    setBusy(true);
    const result = await setScheduleActiveAction(scheduleId, next);
    setBusy(false);

    if (!result.ok) {
      setChecked(!next);
      toast.error(result.error);
      return;
    }
    toast.success(`${scheduleName} ${next ? "resumed" : "paused"}.`);
    router.refresh();
  }

  return (
    <Switch
      checked={checked}
      disabled={busy}
      onCheckedChange={toggle}
      aria-label={`${checked ? "Pause" : "Resume"} ${scheduleName}`}
    />
  );
}

/** Pause / Resume as a labelled button — the detail page has room for words. */
export function ScheduleActiveButton({
  scheduleId,
  active,
  scheduleName,
}: {
  scheduleId: string;
  active: boolean;
  scheduleName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const result = await setScheduleActiveAction(scheduleId, !active);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${scheduleName} ${active ? "paused" : "resumed"}.`);
    router.refresh();
  }

  return (
    <Button variant="outline" disabled={busy} onClick={toggle}>
      {busy ? <Loader2 className="animate-spin" /> : active ? <Pause /> : <Play />}
      {active ? "Pause" : "Resume"}
    </Button>
  );
}

/** "Run now" — bills this period immediately and links straight to the draft. */
export function RunNowButton({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const result = await runRecurringInvoice(scheduleId);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Draft invoice #${result.number} created.`, {
      action: {
        label: "Open",
        onClick: () => router.push(`/invoices/${result.invoiceId}`),
      },
    });
    router.refresh();
  }

  return (
    <Button disabled={busy} onClick={run}>
      {busy ? <Loader2 className="animate-spin" /> : <PlayCircle />}
      Run now
    </Button>
  );
}

/** Batch runner on the list page. Only rendered when something is actually due. */
export function GenerateDueButton({ dueCount }: { dueCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const result = await runDueRecurringInvoices();
    setBusy(false);

    if (result.generated > 0) {
      toast.success(
        `${result.generated} draft invoice${result.generated === 1 ? "" : "s"} created.`,
      );
    }
    if (result.failed > 0) {
      toast.error(result.errors[0] ?? "Some schedules could not be run.");
    }
    if (result.generated === 0 && result.failed === 0) {
      toast.message("Nothing was due.");
    }
    router.refresh();
  }

  return (
    <Button disabled={busy} onClick={run}>
      {busy ? <Loader2 className="animate-spin" /> : <Zap />}
      Generate {dueCount} due now
    </Button>
  );
}
