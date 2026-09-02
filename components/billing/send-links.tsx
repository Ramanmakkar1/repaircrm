"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";

/**
 * SHARE ROW — the two links staff read down the phone or paste into a chat.
 *
 * ---------------------------------------------------------------------------
 * TWO LINKS, TWO DIFFERENT THINGS
 * ---------------------------------------------------------------------------
 * VIEW LINK is the document's own `/portal/i|e/<publicToken>` URL. It never
 * expires and opens the customer's portal without a sign-in (the route handler
 * carries the full reasoning). Stable, so the same URL can be re-sent forever.
 *
 * PAYMENT LINK is a freshly-minted Stripe Checkout session for the balance as
 * it stands RIGHT NOW. It is not stable and must not be treated as if it were —
 * take a payment at the counter and yesterday's link is for the wrong amount.
 * That is why the button says what it copied, and why it is absent entirely
 * when card payments are not configured: a button that can only ever fail is
 * worse than no button.
 */

/**
 * Clipboard write with a fallback.
 *
 * `navigator.clipboard` only exists in a secure context — a shop running the
 * app on a plain-http LAN address has no such thing, and a "Copy" button that
 * silently does nothing there is the worst possible outcome. The deprecated
 * `execCommand("copy")` path still works in exactly those browsers.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through — a rejected permission is not a reason to give up.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    // Off-screen rather than hidden: `display:none` cannot be selected.
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type PaymentLinkAction = (
  invoiceId: string,
) => Promise<{ ok: true; url: string } | { ok: false; reason: string }>;

export function ShareRow({
  viewUrl,
  viewLabel = "Copy view link",
  payment,
}: {
  /** Absolute, frictionless portal URL for this document. */
  viewUrl: string;
  viewLabel?: string;
  /**
   * Present only when card payments are live AND something is still owed.
   * Anything else and there is no payment link to hand out, so the button is
   * not rendered at all rather than rendered dead.
   */
  payment?: { invoiceId: string; action: PaymentLinkAction } | null;
}) {
  const [copied, setCopied] = React.useState<"view" | "pay" | null>(null);
  const [busy, setBusy] = React.useState(false);

  function flash(which: "view" | "pay") {
    setCopied(which);
    setTimeout(() => setCopied((current) => (current === which ? null : current)), 2000);
  }

  async function copyView() {
    const ok = await copyText(viewUrl);
    if (!ok) {
      toast.error("Couldn't reach the clipboard — the link is in the address below.");
      return;
    }
    flash("view");
    toast.success("View link copied — it opens their portal with no sign-in.");
  }

  async function copyPayment() {
    if (!payment) return;
    setBusy(true);
    const result = await payment.action(payment.invoiceId);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    const ok = await copyText(result.url);
    if (!ok) {
      toast.error("Couldn't reach the clipboard on this device.");
      return;
    }
    flash("pay");
    toast.success("Stripe checkout link copied — valid for this balance.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Share
      </span>

      <Button variant="outline" size="sm" onClick={copyView}>
        {copied === "view" ? <Check className="text-status-resolved-fg" /> : <ACTIONS.copyLink />}
        {copied === "view" ? "Copied" : viewLabel}
      </Button>

      {payment ? (
        <Button variant="outline" size="sm" onClick={copyPayment} disabled={busy}>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : copied === "pay" ? (
            <Check className="text-status-resolved-fg" />
          ) : (
            <ACTIONS.pay />
          )}
          {busy
            ? "Opening…"
            : copied === "pay"
              ? "Copied"
              : "Copy payment link"}
        </Button>
      ) : null}
    </div>
  );
}
