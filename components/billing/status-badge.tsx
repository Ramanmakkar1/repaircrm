import * as React from "react";
import { cn } from "@/components/ui/cn";

/**
 * Billing documents have their own status vocabularies that do not map cleanly
 * onto the six canonical ticket statuses in components/ui/badge.tsx (an invoice
 * DRAFT is neutral, not "new"; VOID is muted, not "overdue"). So they get their
 * own badge, built from the same design tokens.
 */

type Tone = {
  bg: string;
  fg: string;
  dot: string;
  label: string;
  /** VOID reads as cancelled — struck through and dimmed. */
  strike?: boolean;
};

const INVOICE_TONES: Record<string, Tone> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-surface-hover",
    fg: "text-muted-foreground",
    dot: "bg-faint-foreground",
  },
  SENT: {
    label: "Sent",
    bg: "bg-status-new-bg",
    fg: "text-status-new-fg",
    dot: "bg-status-new",
  },
  PARTIAL: {
    label: "Partial",
    bg: "bg-status-in-progress-bg",
    fg: "text-status-in-progress-fg",
    dot: "bg-status-in-progress",
  },
  PAID: {
    label: "Paid",
    bg: "bg-status-resolved-bg",
    fg: "text-status-resolved-fg",
    dot: "bg-status-resolved",
  },
  VOID: {
    label: "Void",
    bg: "bg-transparent border border-border-strong",
    fg: "text-faint-foreground",
    dot: "bg-faint-foreground",
    strike: true,
  },
};

const ESTIMATE_TONES: Record<string, Tone> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-surface-hover",
    fg: "text-muted-foreground",
    dot: "bg-faint-foreground",
  },
  SENT: {
    label: "Sent",
    bg: "bg-status-new-bg",
    fg: "text-status-new-fg",
    dot: "bg-status-new",
  },
  APPROVED: {
    label: "Approved",
    bg: "bg-status-resolved-bg",
    fg: "text-status-resolved-fg",
    dot: "bg-status-resolved",
  },
  DECLINED: {
    label: "Declined",
    bg: "bg-status-overdue-bg",
    fg: "text-status-overdue-fg",
    dot: "bg-status-overdue",
  },
  CONVERTED: {
    label: "Converted",
    bg: "bg-status-waiting-bg",
    fg: "text-status-waiting-fg",
    dot: "bg-status-waiting",
  },
};

const FALLBACK: Tone = {
  label: "Unknown",
  bg: "bg-surface-hover",
  fg: "text-muted-foreground",
  dot: "bg-faint-foreground",
};

function DocBadge({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium leading-none",
        tone.bg,
        tone.fg,
        tone.strike && "line-through decoration-1",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      {tone.label}
    </span>
  );
}

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return <DocBadge tone={INVOICE_TONES[status] ?? FALLBACK} className={className} />;
}

export function EstimateStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return <DocBadge tone={ESTIMATE_TONES[status] ?? FALLBACK} className={className} />;
}

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const;
export const ESTIMATE_STATUSES = [
  "DRAFT",
  "SENT",
  "APPROVED",
  "DECLINED",
  "CONVERTED",
] as const;

export function invoiceStatusLabel(status: string): string {
  return (INVOICE_TONES[status] ?? FALLBACK).label;
}

export function estimateStatusLabel(status: string): string {
  return (ESTIMATE_TONES[status] ?? FALLBACK).label;
}

/**
 * Pre-rendered `{ value, label }` pairs for the filter bar. Plain data, because
 * a label *function* cannot be passed across the server/client boundary.
 */
export const INVOICE_STATUS_OPTIONS = INVOICE_STATUSES.map((value) => ({
  value: value as string,
  label: invoiceStatusLabel(value),
}));

export const ESTIMATE_STATUS_OPTIONS = ESTIMATE_STATUSES.map((value) => ({
  value: value as string,
  label: estimateStatusLabel(value),
}));
