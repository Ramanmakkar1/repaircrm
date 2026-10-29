/**
 * Who may see money. Pure, so client components can ask too.
 *
 * THE POLICY
 *   OWNER and FRONT_DESK see and take money, as they always have.
 *   TECH sees the work: repairs, the parts a repair needs, stock quantities.
 *   A technician sees no prices, no costs, no balances, no payments, no
 *   invoices, no estimates, no POS, no cash drawers and no money print pages.
 *
 * Enforced on the server (lib/money-guard.ts): the money routes 404 for a
 * technician and the money fields are never loaded into a technician's props.
 * Hiding a column with CSS is not the policy, it is only what the policy looks
 * like.
 */

export const MONEY_ROLES = ["OWNER", "FRONT_DESK"] as const;

/** Owners and front desk see money; technicians do not. Same rule as the Reports page. */
export function canSeeMoney(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "FRONT_DESK";
}

/** What a money action says to a technician, returned as data (Next hides thrown messages). */
export const MONEY_REFUSED = "Only the owner or front desk can do that.";
