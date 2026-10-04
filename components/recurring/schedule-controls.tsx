"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  runDueRecurringInvoices,
  runRecurringInvoice,
  setScheduleActiveAction,
} from "@/app/(app)/invoices/recurring/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS, ICONS } from "@/components/ui/icons";
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
  // value (another tab, a revalidate), follow it rather than pinning stale
  // state. Adjusted during render, so the switch never flicks to the old
  // position first.
  const [lastActive, setLastActive] = React.useState(active);
  if (lastActive !== active) {
    setLastActive(active);
    setChecked(active);
  }

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
  size,
  tileClassName,
}: {
  scheduleId: string;
  active: boolean;
  scheduleName: string;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
  /** Draw it as one of the bill screen's quick tiles (icon over the word). */
  tileClassName?: string;
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

  const icon = busy ? (
    <Loader2 className="animate-spin" aria-hidden />
  ) : active ? (
    <ACTIONS.pause aria-hidden />
  ) : (
    <ACTIONS.resume aria-hidden />
  );

  if (tileClassName) {
    return (
      <button type="button" className={tileClassName} disabled={busy} onClick={toggle}>
        {icon}
        {active ? "Pause" : "Turn back on"}
      </button>
    );
  }

  return (
    <Button variant="outline" size={size} disabled={busy} onClick={toggle}>
      {icon}
      {active ? "Pause" : "Resume"}
    </Button>
  );
}

/**
 * "Run now" — bills this period immediately and links straight to the draft.
 *
 * With `confirm` (Easy mode) it is the one big "Bill now" button: the first tap
 * says in words what is about to happen (a draft is made; and, when the
 * schedule does them, it is emailed and the card is charged) and a second tap
 * does it. Nothing about the action changes.
 */
export function RunNowButton({
  scheduleId,
  size,
  label = "Run now",
  confirm,
  className,
}: {
  scheduleId: string;
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  size?: ButtonProps["size"];
  label?: string;
  /** Ask first, with this sentence saying what will happen. */
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [asking, setAsking] = React.useState(false);

  async function run() {
    setBusy(true);
    const result = await runRecurringInvoice(scheduleId);
    setBusy(false);
    setAsking(false);

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

  const button = (
    <Button size={size} className={className} disabled={busy} onClick={confirm ? () => setAsking(true) : run}>
      {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.run />}
      {label}
    </Button>
  );

  if (!confirm) return button;

  return (
    <>
      {button}
      <Dialog open={asking} onOpenChange={(next) => !busy && setAsking(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make the next bill now?</DialogTitle>
            <DialogDescription>{confirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2.5">
            <Button type="button" variant="outline" className="h-12 w-full px-5 text-base sm:w-auto" disabled={busy} onClick={() => setAsking(false)}>
              Not now
            </Button>
            <Button type="button" className="h-12 w-full px-5 text-base sm:w-auto" disabled={busy} onClick={run}>
              {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.run />}
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      {busy ? <Loader2 className="animate-spin" /> : <ICONS.automation />}
      Make {dueCount} due {dueCount === 1 ? "bill" : "bills"} now
    </Button>
  );
}
