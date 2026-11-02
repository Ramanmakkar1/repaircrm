/**
 * The shop directory's rules, kept apart from the queries that feed them.
 *
 * Everything here is pure: the loaders in lib/platform-shops.ts do a fixed
 * number of grouped queries (never one per shop) and hand the results to these
 * functions, which decide status, merge the numbers into one row per shop and
 * search, filter, sort and page the list. That split is what lets the tests pin
 * the rules without a database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** No sign-in, sale, repair or audit event for this long and a shop is "Quiet". */
export const QUIET_AFTER_DAYS = 30;
/** Signed up within this many days: shown under "New". */
export const NEW_WITHIN_DAYS = 30;
export const DIRECTORY_PAGE_SIZE = 100;

/**
 * There are no plans or trials in the data model yet, so a shop is one of
 * three things: in use, gone quiet, or scheduled for deletion (which also
 * switches off every login of the shop — lib/account-deletion/shop.ts).
 */
export type ShopStatus = "active" | "quiet" | "closing";

export const SHOP_STATUS_LABELS: Record<ShopStatus, string> = {
  active: "Active",
  quiet: "Quiet",
  closing: "Being deleted",
};

export const SHOP_STATUS_HINTS: Record<ShopStatus, string> = {
  active: `Used in the last ${QUIET_AFTER_DAYS} days`,
  quiet: `Nothing in the last ${QUIET_AFTER_DAYS} days`,
  closing: "The owner asked to delete it; logins are off",
};

/** The newest of several optional dates, or null when there are none. */
export function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (date && !Number.isNaN(date.getTime()) && (!latest || date > latest)) latest = date;
  }
  return latest;
}

export function shopStatus(
  input: { deletionRequestedAt: Date | null; lastActiveAt: Date | null; createdAt: Date },
  now: Date,
): ShopStatus {
  if (input.deletionRequestedAt) return "closing";
  // Signing up counts as using it, so a brand-new shop is not "Quiet".
  const reference = latestDate(input.lastActiveAt, input.createdAt);
  if (reference && now.getTime() - reference.getTime() <= QUIET_AFTER_DAYS * DAY_MS) return "active";
  return "quiet";
}

export function isNewShop(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= NEW_WITHIN_DAYS * DAY_MS;
}

/** Everything the loaders know about one shop, before any rule is applied. */
export type ShopFacts = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  currency: string;
  city: string | null;
  country: string | null;
  deletionRequestedAt: Date | null;
  deletionPurgeAfter: Date | null;
  owner: { name: string; email: string } | null;
  staff: number;
  activeStaff: number;
  customers: number;
  repairs: number;
  invoices: number;
  products: number;
  payments: { count: number; cents: number };
  /** Uploaded files and automatic product photos, from their recorded sizes. */
  uploads: { count: number; bytes: number };
  /** The shop logo; null when it could not be measured. */
  logoBytes: number | null;
  /** Estimated database records; null when the estimate is unavailable. */
  database: { rows: number; bytes: number } | null;
  /** Every "something happened" date the loaders found: sign-ins, sales, repairs, audit events. */
  activity: Array<Date | null>;
};

export type ShopRow = Omit<ShopFacts, "activity"> & {
  lastActiveAt: Date | null;
  status: ShopStatus;
  isNew: boolean;
  /** Files (uploads + logo) in bytes. */
  fileBytes: number;
  /** Files plus the database estimate: the one number to sort "who uses the most space" by. */
  storageBytes: number;
};

export function toShopRow(facts: ShopFacts, now: Date): ShopRow {
  const { activity, ...rest } = facts;
  const lastActiveAt = latestDate(...activity);
  const fileBytes = facts.uploads.bytes + (facts.logoBytes ?? 0);
  return {
    ...rest,
    lastActiveAt,
    status: shopStatus({ deletionRequestedAt: facts.deletionRequestedAt, lastActiveAt, createdAt: facts.createdAt }, now),
    isNew: isNewShop(facts.createdAt, now),
    fileBytes,
    storageBytes: fileBytes + (facts.database?.bytes ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Search, filter, sort, page — all from the URL, so the list works without
// JavaScript and a view can be bookmarked or shared.
// ---------------------------------------------------------------------------

export const SHOP_SORTS = [
  "active",
  "name",
  "created",
  "storage",
  "staff",
  "customers",
  "repairs",
  "invoices",
  "products",
] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_SORT_LABELS: Record<ShopSort, string> = {
  active: "Last active",
  name: "Name",
  created: "Joined",
  storage: "Space used",
  staff: "Staff",
  customers: "Customers",
  repairs: "Repairs",
  invoices: "Invoices",
  products: "Products",
};

export const SHOP_FILTERS = ["all", "active", "quiet", "closing", "new"] as const;
export type ShopFilter = (typeof SHOP_FILTERS)[number];

export const SHOP_FILTER_LABELS: Record<ShopFilter, string> = {
  all: "All shops",
  active: "Active",
  quiet: "Quiet",
  closing: "Being deleted",
  new: "New this month",
};

export type SortDirection = "asc" | "desc";

export type DirectoryQuery = {
  q: string;
  show: ShopFilter;
  sort: ShopSort;
  dir: SortDirection;
  page: number;
};

/** The direction a column sorts in when first clicked: A→Z for names, biggest/newest first for the rest. */
export function defaultDirection(sort: ShopSort): SortDirection {
  return sort === "name" ? "asc" : "desc";
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryQuery {
  const sort = SHOP_SORTS.find((value) => value === single(params.sort)) ?? "active";
  const show = SHOP_FILTERS.find((value) => value === single(params.show)) ?? "all";
  const rawDir = single(params.dir);
  const dir: SortDirection = rawDir === "asc" || rawDir === "desc" ? rawDir : defaultDirection(sort);
  const requested = Number.parseInt(single(params.page) || "1", 10);
  const page = Number.isFinite(requested) ? Math.min(10_000, Math.max(1, requested)) : 1;
  return { q: single(params.q).trim().slice(0, 100), show, sort, dir, page };
}

/** The query string for a directory view; defaults are left out so URLs stay short. */
export function directoryHref(query: Partial<DirectoryQuery>): string {
  const params = new URLSearchParams();
  const sort = query.sort ?? "active";
  if (query.q) params.set("q", query.q);
  if (query.show && query.show !== "all") params.set("show", query.show);
  if (sort !== "active") params.set("sort", sort);
  if (query.dir && query.dir !== defaultDirection(sort)) params.set("dir", query.dir);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/platform/shops?${search}` : "/platform/shops";
}

/** Lower-case and without accents, so "jose" finds "José". */
function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function matchesSearch(row: ShopRow, q: string): boolean {
  const needle = fold(q.trim());
  if (!needle) return true;
  const haystack = [row.name, row.slug, row.id, row.city ?? "", row.owner?.name ?? "", row.owner?.email ?? ""]
    .map(fold)
    .join("\n");
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function matchesFilter(row: ShopRow, show: ShopFilter): boolean {
  if (show === "all") return true;
  if (show === "new") return row.isNew;
  return row.status === show;
}

function sortValue(row: ShopRow, sort: ShopSort): number | string | null {
  switch (sort) {
    case "name":
      return fold(row.name);
    case "created":
      return row.createdAt.getTime();
    case "active":
      return row.lastActiveAt?.getTime() ?? null;
    case "storage":
      return row.storageBytes;
    case "staff":
      return row.staff;
    case "customers":
      return row.customers;
    case "repairs":
      return row.repairs;
    case "invoices":
      return row.invoices;
    case "products":
      return row.products;
  }
}

/** Sorted copy. Unknown values (never active) go last either way; ties fall back to the name. */
export function sortShops(rows: readonly ShopRow[], sort: ShopSort, dir: SortDirection): ShopRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort);
    const right = sortValue(b, sort);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) {
      return (left < right ? -1 : 1) * sign;
    }
    const byName = fold(a.name).localeCompare(fold(b.name));
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
}

export type DirectoryView = {
  rows: ShopRow[];
  /** Shops matching the search and filter, across all pages. */
  matching: number;
  page: number;
  pages: number;
  /** How many shops each filter chip would show for the current search. */
  filterCounts: Record<ShopFilter, number>;
};

export function applyDirectoryQuery(rows: readonly ShopRow[], query: DirectoryQuery): DirectoryView {
  const searched = rows.filter((row) => matchesSearch(row, query.q));
  const filterCounts = Object.fromEntries(
    SHOP_FILTERS.map((filter) => [filter, searched.filter((row) => matchesFilter(row, filter)).length]),
  ) as Record<ShopFilter, number>;
  const matching = sortShops(
    searched.filter((row) => matchesFilter(row, query.show)),
    query.sort,
    query.dir,
  );
  const pages = Math.max(1, Math.ceil(matching.length / DIRECTORY_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  return {
    rows: matching.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE),
    matching: matching.length,
    page,
    pages,
    filterCounts,
  };
}

// ---------------------------------------------------------------------------
// Platform totals for the overview tiles
// ---------------------------------------------------------------------------

export type PlatformTotals = {
  shops: number;
  byStatus: Record<ShopStatus, number>;
  newLast7Days: number;
  newLast30Days: number;
  staff: number;
  activeStaff: number;
  customers: number;
  repairs: number;
  invoices: number;
  products: number;
  /** Payment totals per currency, biggest first — shops do not all share one currency. */
  payments: Array<{ currency: string; count: number; cents: number }>;
  fileBytes: number;
  databaseBytes: number;
  storageBytes: number;
};

export function summarizeShops(rows: readonly ShopRow[], now: Date): PlatformTotals {
  const byStatus: Record<ShopStatus, number> = { active: 0, quiet: 0, closing: 0 };
  const payments = new Map<string, { currency: string; count: number; cents: number }>();
  const totals: PlatformTotals = {
    shops: rows.length,
    byStatus,
    newLast7Days: 0,
    newLast30Days: 0,
    staff: 0,
    activeStaff: 0,
    customers: 0,
    repairs: 0,
    invoices: 0,
    products: 0,
    payments: [],
    fileBytes: 0,
    databaseBytes: 0,
    storageBytes: 0,
  };
  for (const row of rows) {
    byStatus[row.status] += 1;
    const age = now.getTime() - row.createdAt.getTime();
    if (age <= 7 * DAY_MS) totals.newLast7Days += 1;
    if (age <= 30 * DAY_MS) totals.newLast30Days += 1;
    totals.staff += row.staff;
    totals.activeStaff += row.activeStaff;
    totals.customers += row.customers;
    totals.repairs += row.repairs;
    totals.invoices += row.invoices;
    totals.products += row.products;
    totals.fileBytes += row.fileBytes;
    totals.databaseBytes += row.database?.bytes ?? 0;
    totals.storageBytes += row.storageBytes;
    if (row.payments.count > 0) {
      const currency = row.currency.toUpperCase();
      const entry = payments.get(currency) ?? { currency, count: 0, cents: 0 };
      entry.count += row.payments.count;
      entry.cents += row.payments.cents;
      payments.set(currency, entry);
    }
  }
  totals.payments = [...payments.values()].sort((a, b) => b.cents - a.cents || a.currency.localeCompare(b.currency));
  return totals;
}
