/**
 * Shared, dependency-free ticket vocabulary + display rules.
 *
 * Imported by BOTH server components and client components, so this file must
 * stay pure: no `db`, no `next/*`, no "use server".
 */

// ---------------------------------------------------------------------------
// Status pipeline
// ---------------------------------------------------------------------------

/**
 * The built-in workflow. `status` is a free-form string in the schema so a shop
 * can define its own list in `Shop.settings.ticketStatuses` — these are the
 * fallback when it hasn't.
 */
export const DEFAULT_TICKET_STATUSES = [
  "New",
  "In Progress",
  "Waiting for Parts",
  "Waiting on Customer",
  "Ready for Pickup",
  "Resolved",
] as const;

/** The terminal state. Tickets in it stop accruing staleness. */
export const RESOLVED_STATUS = "Resolved";

/**
 * Fallback problem types, used only when `Shop.settings.problemTypes` is empty.
 * A configured shop always wins so the picker matches the shop's own history.
 */
export const DEFAULT_PROBLEM_TYPES = [
  "Hardware",
  "Software",
  "Virus",
  "Screen",
  "Battery",
  "Water Damage",
  "Other",
] as const;

/** Reads a `string[]` out of the loosely-typed `Shop.settings` JSON blob. */
export function settingsList(
  settings: unknown,
  key: string,
  fallback: readonly string[],
): string[] {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const raw = (settings as Record<string, unknown>)[key];
    if (Array.isArray(raw)) {
      const list = raw.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
      if (list.length > 0) return list;
    }
  }
  return [...fallback];
}

export function ticketStatuses(settings: unknown): string[] {
  return settingsList(settings, "ticketStatuses", DEFAULT_TICKET_STATUSES);
}

export function problemTypes(settings: unknown): string[] {
  return settingsList(settings, "problemTypes", DEFAULT_PROBLEM_TYPES);
}

export function isResolved(status: string): boolean {
  return status.trim().toLowerCase() === RESOLVED_STATUS.toLowerCase();
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type PriorityKey = (typeof PRIORITIES)[number];

export const PRIORITY_META: Record<
  PriorityKey,
  { label: string; dot: string; chip: string }
> = {
  LOW: {
    label: "Low",
    dot: "bg-faint-foreground",
    chip: "bg-surface-hover text-muted-foreground",
  },
  NORMAL: {
    label: "Normal",
    dot: "bg-status-new",
    chip: "bg-surface-hover text-muted-foreground",
  },
  HIGH: {
    label: "High",
    dot: "bg-status-in-progress",
    chip: "bg-status-in-progress-bg text-status-in-progress-fg",
  },
  URGENT: {
    label: "Urgent",
    dot: "bg-status-overdue",
    chip: "bg-status-overdue-bg text-status-overdue-fg",
  },
};

export function asPriority(value: unknown): PriorityKey {
  return PRIORITIES.includes(value as PriorityKey)
    ? (value as PriorityKey)
    : "NORMAL";
}

// ---------------------------------------------------------------------------
// Staleness — the "how long since anyone touched this?" heat on the list
// ---------------------------------------------------------------------------

/**
 * Age buckets for `updatedAt`, measured in whole days. Resolved tickets are
 * exempt (they are *supposed* to sit still), which is the whole point: the heat
 * only ever marks work that is actually rotting.
 *
 *   fresh    <  1 day   green
 *   warm     1 – 2 days amber
 *   stale    2 – 3 days orange
 *   critical >  3 days  red
 */
export type StalenessLevel = "none" | "fresh" | "warm" | "stale" | "critical";

const DAY_MS = 24 * 60 * 60 * 1000;

export function stalenessLevel(
  updatedAt: Date | string | number,
  status: string,
  now: number = Date.now(),
): StalenessLevel {
  if (isResolved(status)) return "none";
  const ms = now - new Date(updatedAt).getTime();
  const days = ms / DAY_MS;
  if (days < 1) return "fresh";
  if (days < 2) return "warm";
  if (days < 3) return "stale";
  return "critical";
}

/**
 * Tailwind classes per level. The "stale" orange has no design token of its own,
 * so it uses `light-dark()` (the app sets `color-scheme: light dark`) rather
 * than a fixed palette shade that would glow in dark mode.
 */
export const STALENESS_CLASS: Record<StalenessLevel, string> = {
  none: "text-muted-foreground",
  fresh: "bg-status-resolved-bg text-status-resolved-fg",
  warm: "bg-status-in-progress-bg text-status-in-progress-fg",
  stale:
    "bg-[light-dark(#fdece1,#3a2512)] text-[light-dark(#c2410c,#f0a86e)]",
  critical: "bg-status-overdue-bg text-status-overdue-fg",
};

/**
 * The same heat, expressed as a card border + wash instead of a chip — used by
 * the ticket card grid, where the whole box carries the signal. Same thresholds
 * as STALENESS_CLASS; only the presentation differs.
 */
export const STALENESS_CARD: Record<StalenessLevel, string> = {
  none: "border-border",
  fresh: "border-border",
  warm: "border-status-in-progress/45",
  stale: "border-[light-dark(#efb489,#5c3b1d)] bg-[light-dark(#fffaf6,#221a12)]",
  critical: "border-status-overdue/55 bg-[light-dark(#fffafa,#231715)]",
};

export const STALENESS_LABEL: Record<StalenessLevel, string> = {
  none: "Closed out",
  fresh: "Touched today",
  warm: "Idle 1–2 days",
  stale: "Idle 2–3 days",
  critical: "Idle 3+ days — needs attention",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function customerLabel(customer: {
  firstName: string;
  lastName: string;
  businessName?: string | null;
}): string {
  const person = `${customer.firstName} ${customer.lastName}`.trim();
  return customer.businessName ? `${customer.businessName} (${person})` : person;
}

export function assetLabel(asset: {
  type: string;
  make?: string | null;
  model?: string | null;
  serial?: string | null;
}): string {
  const head = [asset.make, asset.model].filter(Boolean).join(" ");
  const base = head ? `${head} · ${asset.type}` : asset.type;
  return asset.serial ? `${base} · ${asset.serial}` : base;
}

/**
 * Compact age for dense table cells: "just now", "4h", "3d", "2mo".
 *
 * Computed on the server against an explicit `now` so the value is stable
 * between the server render and hydration — a client-side `Date.now()` here
 * would produce a mismatch warning on every row.
 */
export function relativeShort(
  date: Date | string | number,
  now: number = Date.now(),
): string {
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** 3725 -> "1h 2m" ; 45 -> "45s" ; 0 -> "0m" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** 3725 -> "01:02:05" — for the live ticker on a running timer. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
