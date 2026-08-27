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

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  const meta = STATUS_META[key];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
        meta.bg,
        meta.fg,
        className,
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </span>
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
