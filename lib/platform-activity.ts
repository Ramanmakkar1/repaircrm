/**
 * The platform-wide activity feed: new shops, sign-ins, the events an operator
 * should notice, and product feedback, merged into one list newest first.
 *
 * Pure. lib/platform-shops.ts reads each source (one query per source, never
 * one per shop) and these functions classify, word, merge and page the rows.
 */

import { FEEDBACK_KINDS } from "@/lib/product-feedback";

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityKind = "signup" | "signin" | "important" | "feedback" | "other";

export const ACTIVITY_FILTERS = ["all", "signup", "signin", "important", "feedback"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "Everything",
  signup: "New shops",
  signin: "Sign-ins",
  important: "Important",
  feedback: "Feedback",
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  signup: "New shop",
  signin: "Sign-in",
  important: "Important",
  feedback: "Feedback",
  other: "Change",
};

/** Someone got into a shop: a password, Google or email-code sign-in, or a PIN switch at the till. */
export const SIGN_IN_ACTIONS = ["user.login", "user.staff_switch"] as const;

/** Events an operator may need to act on or explain: money reversed, data deleted, access changed. */
export const IMPORTANT_ACTIONS = [
  "shop.deletion_requested",
  "shop.deletion_cancelled",
  "user.login_locked",
  "user.google_refused",
  "user.invited",
  "user.role_changed",
  "user.deactivated",
  "user.reactivated",
  "user.password_reset",
  "user.2fa_disabled",
  "user.2fa_reset",
  "api_key.created",
  "api_key.revoked",
  "invoice.voided",
  "invoice.refunded",
  "ticket.deleted",
  "customer.deleted",
  "product.removed",
] as const;

export function classifyAuditAction(action: string): ActivityKind {
  if ((SIGN_IN_ACTIONS as readonly string[]).includes(action)) return "signin";
  if ((IMPORTANT_ACTIONS as readonly string[]).includes(action)) return "important";
  return "other";
}

export function parseActivityFilter(value: string | string[] | undefined): ActivityFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return ACTIVITY_FILTERS.find((filter) => filter === raw) ?? "all";
}

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: Date;
  /** The sentence itself, e.g. "Voided invoice #1006 — raised against the wrong customer". */
  title: string;
  /** Who did it, when known. */
  actor: string | null;
  shop: { id: string; name: string } | null;
  /** Where the row links to inside the console. */
  href: string | null;
  /** The cursor parts: which source it came from and its id there. */
  source: ActivitySource;
  sourceId: string;
};

/**
 * Sources in tie-break order. Two rows at the same millisecond are ordered by
 * source, then by id, so a page boundary can never drop or repeat a row.
 */
export const ACTIVITY_SOURCES = ["shop", "feedback", "audit"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type AuditActivityRow = {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  shop: { id: string; name: string };
  user: { name: string } | null;
};

export function auditToActivity(row: AuditActivityRow): ActivityItem {
  return {
    id: `audit-${row.id}`,
    kind: classifyAuditAction(row.action),
    at: row.createdAt,
    title: row.summary,
    actor: row.user?.name ?? null,
    shop: row.shop,
    href: `/platform/shops/${row.shop.id}`,
    source: "audit",
    sourceId: row.id,
  };
}

export type SignupActivityRow = {
  id: string;
  name: string;
  createdAt: Date;
  owner: { name: string; email: string } | null;
};

export function signupToActivity(row: SignupActivityRow): ActivityItem {
  return {
    id: `shop-${row.id}`,
    kind: "signup",
    at: row.createdAt,
    title: `New shop signed up: ${row.name}`,
    actor: row.owner ? `${row.owner.name} (${row.owner.email})` : null,
    shop: { id: row.id, name: row.name },
    href: `/platform/shops/${row.id}`,
    source: "shop",
    sourceId: row.id,
  };
}

export type FeedbackActivityRow = { id: string; kind: string; title: string; createdAt: Date };

const FEEDBACK_WORDS: Record<string, string> = { BUG: "Bug report", FEATURE: "Feature request", OTHER: "Feedback" };

export function feedbackToActivity(row: FeedbackActivityRow): ActivityItem {
  const known = FEEDBACK_KINDS.some((kind) => kind.value === row.kind);
  return {
    id: `feedback-${row.id}`,
    kind: "feedback",
    at: row.createdAt,
    title: `${known ? FEEDBACK_WORDS[row.kind] : "Feedback"}: ${row.title}`,
    actor: null,
    shop: null,
    href: "/platform/feedback",
    source: "feedback",
    sourceId: row.id,
  };
}

/** Which sources a filter reads, and which audit actions (null = all of them). */
export function activityPlan(filter: ActivityFilter): {
  shops: boolean;
  feedback: boolean;
  audit: readonly string[] | null | false;
} {
  switch (filter) {
    case "signup":
      return { shops: true, feedback: false, audit: false };
    case "signin":
      return { shops: false, feedback: false, audit: SIGN_IN_ACTIONS };
    case "important":
      return { shops: false, feedback: false, audit: IMPORTANT_ACTIONS };
    case "feedback":
      return { shops: false, feedback: true, audit: false };
    case "all":
      return { shops: true, feedback: true, audit: null };
  }
}

// ---------------------------------------------------------------------------
// Paging: newest first, ties broken by source then id
// ---------------------------------------------------------------------------

export type ActivityCursor = { at: Date; source: ActivitySource; id: string };

export function compareActivity(a: ActivityItem, b: ActivityItem): number {
  const byTime = b.at.getTime() - a.at.getTime();
  if (byTime !== 0) return byTime;
  const bySource = ACTIVITY_SOURCES.indexOf(a.source) - ACTIVITY_SOURCES.indexOf(b.source);
  if (bySource !== 0) return bySource;
  return a.sourceId < b.sourceId ? 1 : a.sourceId > b.sourceId ? -1 : 0;
}

export function encodeCursor(item: Pick<ActivityItem, "at" | "source" | "sourceId">): string {
  return `${item.at.getTime()}.${item.source}.${item.sourceId}`;
}

export function decodeCursor(value: string | string[] | undefined): ActivityCursor | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = /^(\d{1,15})\.(shop|feedback|audit)\.([A-Za-z0-9_-]{1,64})$/.exec(raw ?? "");
  if (!match) return null;
  const at = new Date(Number(match[1]));
  if (Number.isNaN(at.getTime())) return null;
  return { at, source: match[2] as ActivitySource, id: match[3] };
}

export type CursorWhere =
  | { createdAt: { lt: Date } }
  | { createdAt: { lte: Date } }
  | { OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] };

/**
 * The `createdAt`/`id` condition that selects one source's rows strictly after
 * the cursor in feed order. Shaped for Prisma; `undefined` means no condition.
 */
export function afterCursorWhere(source: ActivitySource, cursor: ActivityCursor | null): CursorWhere | undefined {
  if (!cursor) return undefined;
  const mine = ACTIVITY_SOURCES.indexOf(source);
  const theirs = ACTIVITY_SOURCES.indexOf(cursor.source);
  // A later source in the tie-break order still has its rows at the cursor's millisecond to show.
  if (mine > theirs) return { createdAt: { lte: cursor.at } };
  if (mine < theirs) return { createdAt: { lt: cursor.at } };
  return { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] };
}

/** One page from several newest-first lists, each fetched with `limit + 1` rows. */
export function mergeActivity(
  lists: ReadonlyArray<readonly ActivityItem[]>,
  limit: number,
): { items: ActivityItem[]; next: string | null } {
  const merged = lists.flat().sort(compareActivity);
  const items = merged.slice(0, limit);
  const last = items[items.length - 1];
  return { items, next: merged.length > limit && last ? encodeCursor(last) : null };
}
