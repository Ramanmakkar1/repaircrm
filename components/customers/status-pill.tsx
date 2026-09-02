import * as React from "react";

import { StatusPill, type StatusTone } from "@/components/ui/badge";
import {
  estimateStatusTone,
  invoiceStatusTone,
} from "@/components/billing/status-badge";
import { humanizeEnum } from "./format";

/**
 * The status chips in a customer's activity feed.
 *
 * They keep the document's *own* words — a ticket sitting in "Waiting for
 * Parts" says exactly that rather than collapsing to the canonical "Waiting" —
 * while borrowing the app-wide tone for the colour. Billing tones come from
 * `components/billing/status-badge.tsx` so a PAID invoice is the same green
 * here as it is on the invoice itself.
 */

/** Ticket statuses are free-form strings, so match on intent, not equality. */
export function ticketTone(status: string): StatusTone {
  const s = status.trim().toLowerCase();
  if (/resolv|complet|closed|picked/.test(s)) return "success";
  if (/ready/.test(s)) return "ready";
  if (/wait|hold|pending|approval/.test(s)) return "waiting";
  if (/progress|working|diagnos|repair/.test(s)) return "active";
  if (/cancel|void/.test(s)) return "danger";
  return "info";
}

export function TicketStatus({ status }: { status: string }) {
  return <StatusPill size="sm" tone={ticketTone(status)} label={status} />;
}

export function InvoiceStatus({ status }: { status: string }) {
  return (
    <StatusPill
      size="sm"
      tone={invoiceStatusTone(status)}
      label={humanizeEnum(status)}
    />
  );
}

export function EstimateStatus({ status }: { status: string }) {
  return (
    <StatusPill
      size="sm"
      tone={estimateStatusTone(status)}
      label={humanizeEnum(status)}
    />
  );
}
