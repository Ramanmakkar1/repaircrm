/**
 * Shared shape for the ⌘K palette. Lives here (not in the route file) so both
 * the route handler and the client component can import it without the client
 * bundle ever reaching into `app/api/**`.
 */

export type SearchType =
  | "customer"
  | "ticket"
  | "invoice"
  | "estimate"
  | "product"
  | "serial"
  | "lead";

export interface SearchItem {
  type: SearchType;
  id: string;
  /** Primary line — a name or a "#1003 · Subject". */
  title: string;
  /** Secondary line — who it belongs to, when, how much stock, etc. */
  subtitle?: string;
  href: string;
  /** Short status text rendered as a chip on the right of the row. */
  badge?: string;
}

export interface SearchGroup {
  type: SearchType;
  label: string;
  items: SearchItem[];
}

export interface SearchResponse {
  q: string;
  groups: SearchGroup[];
}

/** Plural section headings, also used for the "no matches" hint copy. */
export const TYPE_LABEL: Record<SearchType, string> = {
  customer: "Customers",
  ticket: "Tickets",
  invoice: "Invoices",
  estimate: "Estimates",
  product: "Parts & products",
  serial: "Serial numbers",
  lead: "Leads",
};
