"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { useJobActions } from "./job-actions";
import {
  jobActionCopy,
  jobActions,
  jobMoney,
  jobTabHref,
  type JobActionKind,
  type JobInvoice,
  type JobMoney,
  type ReadyReach,
} from "./job-screen-logic";
import { MakeInvoiceButton } from "./ticket-actions";

type InvoiceProps = React.ComponentProps<typeof MakeInvoiceButton>;

const BIG = "h-14 w-full px-6 text-lg [&_svg]:size-6";
const NEXT = "h-12 w-full px-5 text-base [&_svg]:size-5";
const INLINE = "h-12 px-6 text-base [&_svg]:size-5";

/**
 * The one big button of the repair screen, chosen by where the repair is, and at
 * most one quieter button beside it.
 *
 *   New .................. Start repair
 *   In Progress .......... Mark ready for pickup (tells the customer, or says to call)
 *   Waiting ... .......... Resume repair
 *   Ready for Pickup ..... Take payment $X / Make invoice / Add a charge, with Hand over anyway;
 *                          Hand over once it is paid
 *   Resolved ............. View invoice, then Reopen
 *
 * `jobActions` is the table, and it is the SAME table for both views: Easy
 * renders this twice (in the side column from `lg`, pinned above the tab bar on
 * a phone, each copy hiding itself with CSS) and Full renders it once, inline in
 * the header.
 */
export function JobPrimaryAction({
  pickedUp,
  unbilled,
  customerName,
  invoice,
  invoiceProps,
  inProgress,
  placement,
  money = null,
  seesMoney = true,
  warranty = false,
  reach,
}: {
  /** `pickedUpAt` is stamped: the device has gone home. */
  pickedUp: boolean;
  /** Charges or billable time are still waiting to go on an invoice. */
  unbilled: boolean;
  customerName: string;
  invoice: JobInvoice | null;
  invoiceProps: Omit<InvoiceProps, "trigger" | "label" | "triggerNode">;
  /** The state Start / Resume / Reopen move to; null when the shop's pipeline has no step to move to. */
  inProgress: string | null;
  /** "inline": the Full view's header, both buttons in a row and no hint. */
  placement: "side" | "pinned" | "inline";
  /** The repair's balance (`pickupMoney`), for "Take payment $X". */
  money?: JobMoney | null;
  /** False for a technician: no money button (lib/money-access.ts). */
  seesMoney?: boolean;
  warranty?: boolean;
  /** How "it is ready" would reach the customer. */
  reach?: ReadyReach;
}) {
  // From the status being shown, not the server's: a press moves the buttons the moment it is made.
  const { status } = useJobActions();
  const actions = jobActions({ status, pickedUp, unbilled, invoice, money, seesMoney, warranty });
  if (!actions.primary) return null;

  const dueCents = jobMoney({ money, invoice }).dueCents;
  const context = { customerName, invoiceNumber: invoice?.number ?? null, inProgress: inProgress ?? undefined, dueCents, reach };
  const primary = jobActionCopy(actions.primary, context);
  const buttonProps = { invoice, invoiceProps, inProgress, dueCents };

  if (placement === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <ActionButton kind={actions.primary} primary compact {...buttonProps} />
        {actions.secondary ? <ActionButton kind={actions.secondary} compact {...buttonProps} /> : null}
      </div>
    );
  }

  // Pinned: only the big button, fixed just above the phone's tab bar (64px tall, plus the home-bar inset).
  // The shell keeps 7rem free at the bottom of the page, which is room enough for it.
  if (placement === "pinned") {
    return (
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface px-4 pb-3 pt-3 sm:hidden print:hidden">
        <ActionButton kind={actions.primary} primary {...buttonProps} />
      </div>
    );
  }

  // In the page: from `sm` both buttons and the line saying what pressing it does; on a phone only the quieter one
  // (the big one is pinned), and nothing at all when there is no quieter one.
  return (
    <div className={cn("flex flex-col gap-2 print:hidden", !actions.secondary && "max-sm:hidden")}>
      <div className="flex flex-col gap-2 max-sm:hidden">
        <ActionButton kind={actions.primary} primary {...buttonProps} />
        {primary.hint ? <p className="px-1 text-center text-sm text-muted-foreground">{primary.hint}</p> : null}
      </div>
      {actions.secondary ? <ActionButton kind={actions.secondary} {...buttonProps} /> : null}
    </div>
  );
}

function ActionButton({
  kind,
  primary = false,
  compact = false,
  invoice,
  invoiceProps,
  inProgress,
  dueCents,
}: {
  kind: JobActionKind;
  primary?: boolean;
  /** The Full header's size: 48px tall, as wide as its words. */
  compact?: boolean;
  invoice: JobInvoice | null;
  invoiceProps: Omit<InvoiceProps, "trigger" | "label" | "triggerNode">;
  inProgress: string | null;
  dueCents: number;
}) {
  const { ticketId, busy, changeStatus, openStatus, openReady, openHandover } = useJobActions();
  const size = compact ? INLINE : primary ? BIG : NEXT;
  const variant = primary ? "default" : "outline";
  const copy = jobActionCopy(kind, { invoiceNumber: invoice?.number ?? null, inProgress: inProgress ?? undefined, dueCents });

  switch (kind) {
    case "start":
    case "resume":
      return (
        <Button type="button" variant={variant} className={size} disabled={busy || !inProgress} onClick={() => inProgress && changeStatus(inProgress)}>
          <Play aria-hidden />
          {copy.label}
        </Button>
      );
    case "ready":
      return (
        <Button type="button" variant={variant} className={size} disabled={busy} onClick={openReady}>
          <BellRing aria-hidden />
          {copy.label}
        </Button>
      );
    case "charge":
      // The charges live on the Money tab (Easy); in Full they are on the page, under #charges.
      return (
        <Button asChild variant={variant} className={size}>
          <Link href={`${jobTabHref(ticketId, "money")}#charges`}>
            <ACTIONS.add aria-hidden />
            {copy.label}
          </Link>
        </Button>
      );
    case "handover":
    case "handover-anyway":
      return (
        <Button type="button" variant={variant} className={size} disabled={busy} onClick={openHandover}>
          <ACTIONS.receive aria-hidden />
          {copy.label}
        </Button>
      );
    case "payment":
    case "view-invoice":
      return invoice ? (
        <Button asChild variant={variant} className={size}>
          {/* ?from=repair: the invoice opens with Take payment as its one primary. */}
          <Link href={kind === "payment" ? `/invoices/${invoice.id}?from=repair` : `/invoices/${invoice.id}`}>
            {kind === "payment" ? <ACTIONS.pay aria-hidden /> : <ICONS.invoice aria-hidden />}
            {copy.label}
          </Link>
        </Button>
      ) : null;
    case "invoice":
      return (
        <MakeInvoiceButton
          {...invoiceProps}
          label={copy.label}
          trigger={{ variant, size: "lg", className: size }}
        />
      );
    case "reopen":
      return (
        <Button type="button" variant={variant} className={size} disabled={busy || !inProgress} onClick={() => inProgress && openStatus(inProgress)}>
          <ACTIONS.refresh aria-hidden />
          {copy.label}
        </Button>
      );
  }
}
