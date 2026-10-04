/**
 * "Needs you": the work waiting on a person, as counts you can tap.
 *
 * One list feeds three places, so they can never disagree: Home's Needs
 * attention column, the bell in the controls row and the badge on the phone
 * tab bar. Pure and dependency-free (the database half lives in
 * ./attention-data.ts) so client components can import it.
 */

export type AttentionKey = "ready" | "overdue" | "replies" | "enquiries" | "unpaid" | "low";

export type AttentionCounts = Record<AttentionKey, number>;

export type AttentionItem = {
  key: AttentionKey;
  /** The list it opens, already filtered to exactly these. */
  href: string;
  label: string;
  /** One plain line: what to do about it. */
  hint: string;
  count: number;
  /** Picture under /public, the same one the matching Home tile uses. */
  photo: string;
};

const HOME = "/images/home";
const PRODUCTS = "/images/products";
const CATALOG = "/images/catalog";

/** Most urgent first: a customer standing at the counter beats a shelf running low. */
const ITEMS: Omit<AttentionItem, "count">[] = [
  { key: "ready", href: "/tickets?status=Ready%20for%20Pickup", label: "Ready for pickup", hint: "Let them know, or hand it over", photo: `${HOME}/pickup-bag.webp` },
  { key: "replies", href: "/tickets?status=needs-reply", label: "Customer replies", hint: "A customer wrote back", photo: `${HOME}/customers-cards.webp` },
  { key: "overdue", href: "/tickets?due=overdue", label: "Overdue repairs", hint: "Past the promised date", photo: `${HOME}/time-clock.webp` },
  { key: "enquiries", href: "/leads?status=NEW", label: "New enquiries", hint: "Someone asked for help", photo: `${CATALOG}/microphone.webp` },
  { key: "unpaid", href: "/invoices?status=unpaid", label: "Unpaid invoices", hint: "Waiting for payment", photo: `${HOME}/card-terminal.webp` },
  { key: "low", href: "/inventory?filter=low", label: "Low stock", hint: "Running low or out", photo: `${PRODUCTS}/screen-protector.webp` },
];

/** May this role see money? Technicians see no invoices or amounts anywhere else either. */
export function attentionShowsMoney(role: string): boolean {
  return role !== "TECH";
}

/**
 * Every item this role may see, in order, with its count (zero included, so a
 * caller can say "All clear" or drop the zeros as it likes).
 */
export function attentionItems(counts: Partial<AttentionCounts>, role: string): AttentionItem[] {
  return ITEMS.filter((item) => item.key !== "unpaid" || attentionShowsMoney(role)).map((item) => ({
    ...item,
    count: Math.max(0, Math.floor(counts[item.key] ?? 0)),
  }));
}

/** Only the items that need someone right now. */
export function waitingItems(items: readonly AttentionItem[]): AttentionItem[] {
  return items.filter((item) => item.count > 0);
}

/** The one number on the bell and the tab bar. */
export function attentionTotal(items: readonly AttentionItem[]): number {
  return items.reduce((sum, item) => sum + item.count, 0);
}

/** "99+" past two digits, so a pill never grows wider than the button it sits on. */
export function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** What a screen reader hears on the bell: the number, then what it means. */
export function needsYouLabel(total: number): string {
  if (total <= 0) return "Needs you: nothing waiting";
  return `Needs you: ${countLabel(total)} ${total === 1 ? "thing" : "things"} waiting`;
}
