import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none w-fit",
  {
    variants: {
      variant: {
        default: "bg-accent-soft text-accent-soft-foreground",
        outline: "border border-border-strong text-foreground",
        secondary: "bg-surface-hover text-muted-foreground",
        destructive: "bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/* ------------------------------------------------------------------ tones ---
 *
 * Every status the app shows — a ticket, an invoice, a purchase order, a
 * webhook delivery, a cash drawer, a warranty — resolves to one of seven
 * tones. Domain modules declare a tone; only this file knows what a tone
 * looks like. That is what keeps "Ordered" the same amber on the parts card,
 * the purchase order list and the printed PO.
 *
 * Calm on white by construction: a soft tint from the token set, a readable
 * same-hue foreground, and the word itself always present — colour is never
 * the only signal, and a dot never appears without its label.
 */
export type StatusTone =
  /** No opinion: draft, not started, archived. */
  | "neutral"
  /** Fresh and untouched — blue. */
  | "info"
  /** Somebody is working on it right now — amber. */
  | "active"
  /** Blocked on a part, a customer or an approval — violet. */
  | "waiting"
  /** Finished on our side, waiting to be collected — teal. */
  | "ready"
  /** Done, paid, received — green. */
  | "success"
  /** Late, failed, refunded, short — red. */
  | "danger";

export const TONE_CLASS: Record<StatusTone, { chip: string; dot: string }> = {
  neutral: {
    chip: "bg-surface-hover text-muted-foreground",
    dot: "bg-faint-foreground",
  },
  info: {
    chip: "bg-status-new-bg text-status-new-fg",
    dot: "bg-status-new",
  },
  active: {
    chip: "bg-status-in-progress-bg text-status-in-progress-fg",
    dot: "bg-status-in-progress",
  },
  waiting: {
    chip: "bg-status-waiting-bg text-status-waiting-fg",
    dot: "bg-status-waiting",
  },
  ready: {
    chip: "bg-status-ready-bg text-status-ready-fg",
    dot: "bg-status-ready",
  },
  success: {
    chip: "bg-status-resolved-bg text-status-resolved-fg",
    dot: "bg-status-resolved",
  },
  danger: {
    chip: "bg-status-overdue-bg text-status-overdue-fg",
    dot: "bg-status-overdue",
  },
};

/**
 * The one status renderer. Give it a tone and the word.
 *
 * `dot` is on by default because a leading dot is what makes a row of pills
 * scannable; turn it off where the pill already sits next to a status icon.
 * `struck` is for the called-off states (a canceled PO, a voided invoice) —
 * the label stays readable, it is just visibly no longer in play.
 */
export function StatusPill({
  tone,
  label,
  size = "md",
  dot = true,
  struck = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone: StatusTone;
  label: string;
  /**
   * `md` is the pill on a card or a page header. `sm` is the compact badge
   * for a dense list — a customer's activity feed, a document row — where a
   * full-size pill would out-shout the row it labels.
   */
  size?: "sm" | "md";
  dot?: boolean;
  struck?: boolean;
}) {
  const meta = TONE_CLASS[tone];
  const small = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center leading-none",
        small
          ? "gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium"
          : "gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        meta.chip,
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn(
            "shrink-0 rounded-full",
            small ? "size-1.5" : "size-2",
            meta.dot,
          )}
        />
      ) : null}
      <span className={cn("truncate", struck && "line-through")}>{label}</span>
    </span>
  );
}

/**
 * Semantic ticket/job status colors, used consistently everywhere in the app
 * (badges, table dots, kanban columns, filters):
 *   new · in-progress · waiting · ready · resolved · overdue
 */
export type StatusKey =
  | "new"
  | "in-progress"
  | "waiting"
  | "ready"
  | "resolved"
  | "overdue";

const STATUS_META: Record<StatusKey, { label: string; bg: string; fg: string; dot: string }> = {
  new: {
    label: "New",
    bg: "bg-status-new-bg",
    fg: "text-status-new-fg",
    dot: "bg-status-new",
  },
  "in-progress": {
    label: "In Progress",
    bg: "bg-status-in-progress-bg",
    fg: "text-status-in-progress-fg",
    dot: "bg-status-in-progress",
  },
  waiting: {
    label: "Waiting",
    bg: "bg-status-waiting-bg",
    fg: "text-status-waiting-fg",
    dot: "bg-status-waiting",
  },
  ready: {
    label: "Ready",
    bg: "bg-status-ready-bg",
    fg: "text-status-ready-fg",
    dot: "bg-status-ready",
  },
  resolved: {
    label: "Resolved",
    bg: "bg-status-resolved-bg",
    fg: "text-status-resolved-fg",
    dot: "bg-status-resolved",
  },
  overdue: {
    label: "Overdue",
    bg: "bg-status-overdue-bg",
    fg: "text-status-overdue-fg",
    dot: "bg-status-overdue",
  },
};

/** Aliases so upstream ticket/invoice status strings map onto the 6 canonical keys. */
const STATUS_ALIASES: Record<string, StatusKey> = {
  new: "new",
  open: "new",
  created: "new",
  "in-progress": "in-progress",
  "in_progress": "in-progress",
  inprogress: "in-progress",
  active: "in-progress",
  working: "in-progress",
  waiting: "waiting",
  "on-hold": "waiting",
  "on_hold": "waiting",
  hold: "waiting",
  "waiting-on-parts": "waiting",
  "waiting-for-parts": "waiting",
  "waiting-on-customer": "waiting",
  "waiting-for-customer": "waiting",
  "awaiting-approval": "waiting",
  ready: "ready",
  "ready-for-pickup": "ready",
  "ready_for_pickup": "ready",
  "picked-up": "resolved",
  resolved: "resolved",
  done: "resolved",
  closed: "resolved",
  completed: "resolved",
  complete: "resolved",
  paid: "resolved",
  overdue: "overdue",
  stale: "overdue",
  late: "overdue",
  cancelled: "overdue",
  canceled: "overdue",
  unpaid: "overdue",
};

export function normalizeStatus(status: string): StatusKey {
  const key = status.trim().toLowerCase().replace(/\s+/g, "-");
  return STATUS_ALIASES[key] ?? "new";
}

/** The six canonical ticket states, expressed in the app-wide tone language. */
export const STATUS_TONE: Record<StatusKey, StatusTone> = {
  new: "info",
  "in-progress": "active",
  waiting: "waiting",
  ready: "ready",
  resolved: "success",
  overdue: "danger",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  return (
    <StatusPill
      tone={STATUS_TONE[key]}
      label={STATUS_META[key].label}
      className={className}
    />
  );
}

/** A bare status dot, for dense table rows / kanban headers without the label. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const key = normalizeStatus(status);
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", STATUS_META[key].dot, className)}
    />
  );
}

export { STATUS_META };
