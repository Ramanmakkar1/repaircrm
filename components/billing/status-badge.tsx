import * as React from "react";

import { StatusPill, type StatusTone } from "@/components/ui/badge";

/**
 * Billing documents have their own status vocabularies that do not map onto
 * the six canonical ticket statuses (an invoice DRAFT is neutral, not "new";
 * VOID is muted, not "overdue"). What they do share is the app-wide tone
 * language — so this file owns the *vocabulary* and `StatusPill` owns the
 * *look*, which is why a PAID invoice and a RECEIVED purchase order are the
 * same green everywhere.
 */

type DocStatusMeta = {
  label: string;
  tone: StatusTone;
  /** VOID reads as called-off — struck through, not shouted about in red. */
  struck?: boolean;
};

const INVOICE_TONES: Record<string, DocStatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  PARTIAL: { label: "Partial", tone: "active" },
  PAID: { label: "Paid", tone: "success" },
  VOID: { label: "Void", tone: "neutral", struck: true },
};

const ESTIMATE_TONES: Record<string, DocStatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  CONVERTED: { label: "Converted", tone: "waiting" },
};

const FALLBACK: DocStatusMeta = { label: "Unknown", tone: "neutral" };

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = INVOICE_TONES[status] ?? FALLBACK;
  return (
    <StatusPill
      size="sm"
      tone={meta.tone}
      label={meta.label}
      struck={meta.struck}
      className={className}
    />
  );
}

export function EstimateStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = ESTIMATE_TONES[status] ?? FALLBACK;
  return (
    <StatusPill
      size="sm"
      tone={meta.tone}
      label={meta.label}
      struck={meta.struck}
      className={className}
    />
  );
}

/**
 * A refund's own life cycle, which is Stripe's rather than the shop's.
 *
 * "Completed" renders nothing at all: it is the silent default, and a green
 * pill on every historical refund would out-shout the two states that actually
 * need chasing. A failed refund is red because the customer has NOT been paid
 * back — see `sumRefunds` in refund-math.ts, which excludes it from the money.
 */
const REFUND_TONES: Record<string, DocStatusMeta> = {
  pending: { label: "Waiting on Stripe", tone: "waiting" },
  failed: { label: "Failed — nothing was returned", tone: "danger" },
};

export function RefundStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const meta = status ? REFUND_TONES[status] : undefined;
  if (!meta) return null;
  return (
    <StatusPill
      size="sm"
      tone={meta.tone}
      label={meta.label}
      className={className}
    />
  );
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

/** The tone a billing status carries, for callers rendering their own chrome. */
export function invoiceStatusTone(status: string): StatusTone {
  return (INVOICE_TONES[status] ?? FALLBACK).tone;
}

export function estimateStatusTone(status: string): StatusTone {
  return (ESTIMATE_TONES[status] ?? FALLBACK).tone;
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
