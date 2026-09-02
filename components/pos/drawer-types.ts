/**
 * Shared shapes and denominations for the cash drawer.
 *
 * Pure — imported by the server actions and by the client dialogs, so no `db`,
 * no `next/*`, no "use server". (Same contract as components/pos/types.ts.)
 */

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

/** The open session as the POS strip sees it. */
export type OpenDrawer = {
  id: string;
  openedAtISO: string;
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

export const DRAWER_VERDICT_CLASS: Record<DrawerVerdict, string> = {
  balanced: "bg-surface-hover text-muted-foreground",
  over: "bg-status-resolved-bg text-status-resolved-fg",
  short: "bg-status-overdue-bg text-status-overdue-fg",
};
