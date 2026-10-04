/**
 * Shared shape for the search sheet (the Search button / Ctrl-K). Lives here
 * (not in the route file) so both the route handler and the client component
 * can import it without the client bundle ever reaching into `app/api/**`.
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
  /** Primary line — a name or a "#1003 · Customer". */
  title: string;
  /** Secondary line — the device and fault, a phone number, how much stock. */
  subtitle?: string;
  href: string;
  /** Short status text, shown as a word on the right of the row. */
  badge?: string;
  /** A picture under /public (a device family, a product, an invoice pad) or a /files photo. */
  picture?: string | null;
  /** Initials for a person (customers and enquiries), drawn in a circle. */
  initials?: string;
  /** A product's selling price, already formatted ("$24.99"). */
  price?: string;
  /** The record whose number was typed: shown first, on its own, as the answer. */
  exact?: boolean;
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

/** Plural section headings, in the shop's own words. */
export const TYPE_LABEL: Record<SearchType, string> = {
  customer: "Customers",
  ticket: "Repairs",
  invoice: "Invoices",
  estimate: "Estimates",
  product: "Products",
  serial: "Serial numbers",
  lead: "Enquiries",
};

/** The order groups appear in: what the counter looks up most, first. */
export const GROUP_ORDER: SearchType[] = ["ticket", "customer", "invoice", "product", "estimate", "lead", "serial"];

/** The groups in GROUP_ORDER, with the typed number's record lifted out as the top answer. */
export function arrangeResults(groups: readonly SearchGroup[]): { exact: SearchItem[]; groups: SearchGroup[] } {
  const exact: SearchItem[] = [];
  const ordered = [...groups].sort((a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type));
  const rest = ordered
    .map((group) => {
      const items = group.items.filter((item) => {
        if (!item.exact) return true;
        exact.push(item);
        return false;
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
  return { exact, groups: rest };
}
