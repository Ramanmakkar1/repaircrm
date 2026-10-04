"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause } from "lucide-react";
import { toast } from "sonner";

import {
  setCampaignActiveAction,
  syncAndSendAction,
  syncCampaignAction,
  type SyncAndSendResult,
} from "@/app/(app)/marketing/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";

/**
 * The live controls on the marketing screens.
 *
 * Each one awaits its Server Action and reports the result, rather than posting
 * a form — "4 queued · 2 sent" is the whole point of pressing the button, and a
 * plain form submit has nowhere to put it.
 */

/** "4 queued · 2 sent · 1 skipped" — only the parts that actually happened. */
function summarise(result: SyncAndSendResult): string {
  const parts: string[] = [];
  if (result.scheduled > 0) parts.push(`${result.scheduled} queued`);
  if (result.sent > 0) parts.push(`${result.sent} sent`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}

function report(result: SyncAndSendResult): void {
  const summary = summarise(result);
  if (!summary) {
    toast.message("Nothing new to send.", {
      description: "Every qualifying event already has a message queued.",
    });
    return;
  }
  const description =
    result.failed > 0
      ? (result.firstProblem ?? undefined)
      : result.skipped > 0
        ? "Skipped messages are listed on the campaign, with the reason."
        : undefined;

  if (result.failed > 0) toast.error(summary, { description });
  else toast.success(summary, { description });
}

/** The on/off state shared by the table switch and the Easy-mode strip. Optimistic, reverts on failure. */
function useCampaignToggle(campaignId: string, active: boolean, campaignName: string) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(active);
  const [busy, setBusy] = React.useState(false);

  // The server is the source of truth: follow a re-render rather than pinning
  // stale state from another tab or a revalidate. Adjusted during render, so
  // the switch never flicks to the old position first.
  const [lastActive, setLastActive] = React.useState(active);
  if (lastActive !== active) {
    setLastActive(active);
    setChecked(active);
  }

  async function toggle(next: boolean) {
    setChecked(next);
    setBusy(true);
    const result = await setCampaignActiveAction(campaignId, next);
    setBusy(false);

    if (!result.ok) {
      setChecked(!next);
      toast.error(result.error);
      return;
    }
    toast.success(`${campaignName} ${next ? "switched on" : "paused"}.`);
    router.refresh();
  }

  return { checked, busy, toggle };
}

/** Inline on/off toggle for a campaign row in the Full-mode table. */
export function CampaignActiveSwitch({
  campaignId,
  active,
  campaignName,
}: {
  campaignId: string;
  active: boolean;
  campaignName: string;
}) {
  const { checked, busy, toggle } = useCampaignToggle(campaignId, active, campaignName);

  return (
    <Switch
      checked={checked}
      disabled={busy}
      onCheckedChange={toggle}
      aria-label={`${checked ? "Pause" : "Switch on"} ${campaignName}`}
    />
  );
}

/**
 * The Easy-mode on/off control under a campaign card: the whole 56px strip is
 * the tap target (a bare switch is only 44 x 24), and the words follow the
 * switch the instant it is pressed. The strip is a `<label>`, so pressing
 * anywhere on it presses the switch inside it.
 */
export function CampaignActiveStrip({
  campaignId,
  active,
  campaignName,
}: {
  campaignId: string;
  active: boolean;
  campaignName: string;
}) {
  const { checked, busy, toggle } = useCampaignToggle(campaignId, active, campaignName);

  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4",
        "transition-colors hover:border-ring active:bg-surface-hover",
        "focus-within:ring-2 focus-within:ring-ring",
        busy && "cursor-wait opacity-70",
      )}
    >
      <span className="text-[15px] font-medium text-muted-foreground">
        {checked ? "Sending on its own" : "Not sending"}
      </span>
      <Switch
        checked={checked}
        disabled={busy}
        onCheckedChange={toggle}
        aria-label={`${checked ? "Pause" : "Switch on"} ${campaignName}`}
      />
    </label>
  );
}

/** Pause / Resume as a labelled button — the detail page has room for words. */
export function CampaignActiveButton({
  campaignId,
  active,
  campaignName,
}: {
  campaignId: string;
  active: boolean;
  campaignName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const result = await setCampaignActiveAction(campaignId, !active);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${campaignName} ${active ? "paused" : "resumed"}.`);
    router.refresh();
  }

  return (
    <Button variant="outline" disabled={busy} onClick={toggle}>
      {busy ? <Loader2 className="animate-spin" /> : active ? <Pause /> : <ACTIONS.run />}
      {active ? "Pause" : "Resume"}
    </Button>
  );
}

/**
 * The list-page runner: queues newly qualifying events, then sends whatever is
 * due. Labelled with the count so pressing it is never a leap of faith.
 */
export function SyncAndSendButton({
  dueCount,
  quiet = false,
}: {
  dueCount: number;
  /**
   * Always the outline button, never the black one. Easy mode uses it so the
   * page keeps one primary action ("New campaign") even when messages are due.
   */
  quiet?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const result = await syncAndSendAction();
    setBusy(false);
    report(result);
    router.refresh();
  }

  return (
    <Button
      variant={dueCount > 0 && !quiet ? "default" : "outline"}
      disabled={busy}
      onClick={run}
    >
      {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.send />}
      {dueCount > 0 ? `Send ${dueCount} due now` : "Sync & send due now"}
    </Button>
  );
}

/** Same engine, scoped to one campaign, on its detail page. */
export function SyncCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const outcome = await syncCampaignAction(campaignId);
    setBusy(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    report(outcome.result);
    router.refresh();
  }

  return (
    <Button disabled={busy} onClick={run}>
      {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.refresh />}
      Sync
    </Button>
  );
}
