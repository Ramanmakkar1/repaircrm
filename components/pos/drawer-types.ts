/**
 * Shared shapes and denominations for the cash drawer.
 *
 * Pure — imported by the server actions and by the client dialogs, so no `db`,
 * no `next/*`, no "use server". (Same contract as components/pos/types.ts.)
 * The tone import below is type-only and erased before any of that matters.
 */

import type { StatusTone } from "@/components/ui/badge";

/** What the till should hold, and where each part of it came from. */
export type DrawerSummary = {
  openingCents: number;
  paymentsCents: number;
  paymentsCount: number;
  depositsCents: number;
  depositsCount: number;
  refundsCents: number;
  refundsCount: number;
  /** opening + payments + deposits − refunds. */
  expectedCents: number;
};

/**
 * The open session as the POS strip sees it.
 *
 * `openedAtLabel` is already formatted, deliberately. The strip is a client
 * component inside a server-rendered page, and turning an instant into "9:14 AM"
 * in the browser gives a different string from the one the server printed the
 * moment the till and the server disagree about the timezone — which is a
 * hydration mismatch, and on a tablet at the counter it is the common case.
 * The server formats it once, in the shop's own zone, and hands over the words.
 */
export type OpenDrawer = {
  id: string;
  openedAtLabel: string;
  openedByName: string;
  openingCents: number;
};

/**
 * US bills and coins, largest first — the order a person counts a till in.
 * Values are cents, so the counter never touches a float.
 */
export const DRAWER_DENOMINATIONS: { label: string; cents: number }[] = [
  { label: "$100", cents: 10000 },
  { label: "$50", cents: 5000 },
  { label: "$20", cents: 2000 },
  { label: "$10", cents: 1000 },
  { label: "$5", cents: 500 },
  { label: "$1", cents: 100 },
  { label: "25¢", cents: 25 },
  { label: "10¢", cents: 10 },
  { label: "5¢", cents: 5 },
  { label: "1¢", cents: 1 },
];

/**
 * Over / short, as the shop talks about it.
 *
 * A difference of exactly zero is its own state ("balanced") rather than a
 * green "over $0.00" — the whole point of the count is that nought is the good
 * outcome, and it should look different from a small surplus.
 */
export type DrawerVerdict = "balanced" | "over" | "short";

export function drawerVerdict(differenceCents: number): DrawerVerdict {
  if (differenceCents === 0) return "balanced";
  return differenceCents > 0 ? "over" : "short";
}

/**
 * The verdict in the app-wide tone language (see `components/ui/badge.tsx`).
 *
 * Nought is the outcome the count is FOR, so balanced is the green one. A
 * surplus is still a discrepancy — somebody was given the wrong change — so it
 * gets amber rather than the green it used to wear, and short keeps the red.
 */
export const DRAWER_VERDICT_META: Record<
  DrawerVerdict,
  { label: string; tone: StatusTone }
> = {
  balanced: { label: "Balanced", tone: "success" },
  over: { label: "Over", tone: "active" },
  short: { label: "Short", tone: "danger" },
};
