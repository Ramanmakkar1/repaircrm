import * as React from "react";

import { STATUS_META, type StatusKey } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { humanizeEnum } from "./format";

/**
 * Same visual language as `StatusBadge`, but keeps the caller's label.
 *
 * `StatusBadge` renders the canonical label for whichever of the six semantic
 * keys a status normalises to — which is right for filters, but wrong here: a
 * ticket sitting in "Waiting for Parts" would render as "New", and an invoice
 * in `PARTIAL` would read "In Progress". This pill borrows the shared palette
 * (STATUS_META) while showing the real document status.
 */
export function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: StatusKey;
  className?: string;
}) {
  const meta = STATUS_META[tone];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium leading-none",
        meta.bg,
        meta.fg,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {label}
    </span>
  );
}

/** Ticket statuses are free-form strings, so match on intent, not equality. */
export function ticketTone(status: string): StatusKey {
  const s = status.trim().toLowerCase();
  if (/resolv|complet|closed|picked/.test(s)) return "resolved";
  if (/ready/.test(s)) return "ready";
  if (/wait|hold|pending|approval/.test(s)) return "waiting";
  if (/progress|working|diagnos|repair/.test(s)) return "in-progress";
  if (/cancel|void/.test(s)) return "overdue";
  return "new";
}

export function invoiceTone(status: string): StatusKey {
  switch (status) {
    case "PAID":
      return "resolved";
    case "PARTIAL":
      return "in-progress";
    case "SENT":
      return "new";
    case "DRAFT":
      return "waiting";
    case "VOID":
      return "overdue";
    default:
      return "new";
  }
}

export function estimateTone(status: string): StatusKey {
  switch (status) {
    case "APPROVED":
      return "resolved";
    case "CONVERTED":
      return "ready";
    case "DECLINED":
      return "overdue";
    case "DRAFT":
      return "waiting";
    case "SENT":
      return "new";
    default:
      return "new";
  }
}

export function TicketStatus({ status }: { status: string }) {
  return <StatusPill label={status} tone={ticketTone(status)} />;
}

export function InvoiceStatus({ status }: { status: string }) {
  return <StatusPill label={humanizeEnum(status)} tone={invoiceTone(status)} />;
}

export function EstimateStatus({ status }: { status: string }) {
  return <StatusPill label={humanizeEnum(status)} tone={estimateTone(status)} />;
}
