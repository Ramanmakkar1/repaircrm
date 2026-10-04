/**
 * The small decisions behind the one-screen register ("terminal") layout.
 *
 * Pure on purpose: no React, no DOM. The components only draw what these return,
 * which keeps the wording, the sums and the sizing testable without a browser.
 */

import type { StatusTone } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import type { OpenDrawer } from "./drawer-types";
import type { CartLine, PosCustomer, TenderMethod } from "./types";
import { isTicketLine, METHOD_LABELS } from "./types";

/** Space left under the terminal so the cart's Pay row never touches the screen edge. */
export const TERMINAL_BOTTOM_GAP = 12;

/**
 * How tall the one-screen register should be: whatever the page area holds,
 * less the page's own top padding and a small gap at the bottom. The page area
 * is the shell's scrolling `<main>`, which already excludes the header.
 */
export function terminalHeight(
  mainClientHeight: number,
  mainPaddingTop: number,
  bottomGap: number = TERMINAL_BOTTOM_GAP,
): number {
  return Math.max(0, Math.round(mainClientHeight - mainPaddingTop - bottomGap));
}

/** Everything the toolbar's drawer chip says: the word, its tone and one line of detail. */
export type DrawerChipInfo = {
  label: "Drawer open" | "Drawer closed";
  tone: Extract<StatusTone, "success" | "neutral">;
  detail: string;
};

export function drawerChipInfo(drawer: OpenDrawer | null): DrawerChipInfo {
  if (!drawer) {
    return {
      label: "Drawer closed",
      tone: "neutral",
      detail: "Open it with the float in the till before taking cash.",
    };
  }
  return {
    label: "Drawer open",
    tone: "success",
    detail: `Since ${drawer.openedAtLabel} · ${formatCents(drawer.openingCents)} float · ${drawer.openedByName}`,
  };
}

/** What the customer chip in the cart header shows. */
export type CustomerChipInfo = {
  /** The name, or "Walk-in" when nobody is attached. */
  name: string;
  walkIn: boolean;
  /** Small facts under the name: store credit and tax-exempt, in words. */
  facts: string[];
};

export function customerChipInfo(customer: PosCustomer | null): CustomerChipInfo {
  if (!customer) return { name: "Walk-in", walkIn: true, facts: [] };
  const facts: string[] = [];
  if (customer.creditBalanceCents > 0) {
    facts.push(`${formatCents(customer.creditBalanceCents)} credit`);
  }
  if (customer.taxExempt) facts.push("Tax exempt");
  return { name: customer.label, walkIn: false, facts };
}

/** One entry of the "More" pay menu (everything after Cash and Card). */
export type MoreTender = {
  method: TenderMethod;
  label: string;
  /** Shown under the label when the option is switched off, so it explains itself. */
  hint: string | null;
  disabled: boolean;
};

/**
 * Check, Other and Store credit. Store credit is only offered when there is
 * credit to spend — an enabled button that always errors is worse than none.
 */
export function moreTenders(creditCents: number): MoreTender[] {
  const creditReady = creditCents > 0;
  return [
    { method: "CHECK", label: METHOD_LABELS.CHECK, hint: null, disabled: false },
    { method: "OTHER", label: METHOD_LABELS.OTHER, hint: null, disabled: false },
    {
      method: "CREDIT",
      label: creditReady
        ? `${METHOD_LABELS.CREDIT} · ${formatCents(creditCents)} available`
        : METHOD_LABELS.CREDIT,
      hint: creditReady ? null : "Add a customer who has store credit to use this.",
      disabled: !creditReady,
    },
  ];
}

/** Number of things in the cart (a quantity of 3 is 3 things). */
export function cartItemCount(lines: readonly { quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * A repair line is stored as "Ticket #12 — Screen replacement" because that is
 * what lands on the invoice. On screen the repair already has its own header
 * ("Repair #12"), so the row only needs the part after the dash.
 */
export function repairLineLabel(line: Pick<CartLine, "name" | "ticketNumber">): string {
  if (line.ticketNumber == null) return line.name;
  const prefix = `Ticket #${line.ticketNumber} — `;
  return line.name.startsWith(prefix) ? line.name.slice(prefix.length) : line.name;
}

/** "1 item" / "12 items" — the count under a shelf picture. */
export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** How many repair lines and loose lines a cart holds: all the scroll rule below needs. */
export type LineCounts = { ticket: number; loose: number };

export function lineCounts(lines: readonly CartLine[]): LineCounts {
  const ticket = lines.filter(isTicketLine).length;
  return { ticket, loose: lines.length - ticket };
}

/**
 * Where the cart's lines should scroll to after the cart changed.
 *
 * A repair is one block pinned ABOVE the loose items, so picking one has to show
 * the top ("Repair #N" and its Remove button), not the bottom of the list. A
 * loose item lands under everything else, so it is scrolled into view at the
 * bottom. Anything else (a quantity step, a removal) leaves the scroll alone.
 */
export function cartScrollTarget(before: LineCounts, after: LineCounts): "top" | "bottom" | null {
  if (after.ticket > before.ticket) return "top";
  if (after.loose > before.loose) return "bottom";
  return null;
}
