"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { copyText } from "./send-links";
import { runReceipt, type ReceiptAction } from "./send-receipt";
import { TILE_CLASS } from "./tile-style";

/**
 * The two tiles on a bill that do something in place instead of going
 * somewhere: copy the customer's link, and email the receipt.
 *
 * Both reuse what the page already had. The link is the same frictionless view
 * URL the Share tab hands out (and `copyText` is the same clipboard routine,
 * with its fallback for a shop running on plain http), and the receipt goes
 * through the same server action, with the same toast, as the "Email receipt"
 * line in the More menu.
 */

/** Copies the document's view link. Says "Copied" for two seconds, then goes back. */
export function CopyLinkTile({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    const ok = await copyText(url);
    if (!ok) {
      toast.error("Couldn't reach the clipboard. The link is on the Share tab.");
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied. It opens their page with no sign-in.");
  }

  return (
    <button type="button" className={TILE_CLASS} onClick={() => void copy()}>
      {copied ? <Check aria-hidden className="text-status-resolved-fg" /> : <ACTIONS.copyLink aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Emails the receipt for a paid invoice.
 *
 * When the customer cannot be emailed the tile still answers: a finger has no
 * hover to show a tooltip, so the reason arrives as a message instead of
 * living in a title nobody can read on a tablet.
 */
export function EmailReceiptTile({
  invoiceId,
  action,
  blockedReason,
  className,
}: {
  invoiceId: string;
  action: ReceiptAction;
  /** Why the customer cannot be emailed, or null. */
  blockedReason: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (blockedReason) {
      toast.warning(blockedReason);
      return;
    }
    setBusy(true);
    try {
      await runReceipt(invoiceId, action);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={cn(TILE_CLASS, className)} disabled={busy} onClick={() => void send()}>
      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <ACTIONS.email aria-hidden />}
      {busy ? "Sending" : "Send receipt"}
    </button>
  );
}
