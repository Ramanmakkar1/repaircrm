import Link from "next/link";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";

import { ConsoleShell } from "@/components/platform/console-shell";
import { NewPill, PageTitle, RecountStorage, StatusPill, TimeAgo } from "@/components/platform/console-ui";
import { cn } from "@/components/ui/cn";
import {
  SHOP_FILTERS,
  SHOP_FILTER_LABELS,
  SHOP_SORTS,
  SHOP_SORT_LABELS,
  defaultDirection,
  directoryHref,
  type DirectoryQuery,
  type ShopRow,
  type ShopSort,
} from "@/lib/platform-directory";
import { formatBytes, formatCount, formatDate } from "@/lib/platform-format";
import { readShopDirectory } from "@/lib/platform-shops";

export const metadata = { title: "Shops · Operator console" };

const NUMBER_COLUMNS = ["staff", "customers", "repairs", "invoices", "products"] as const satisfies readonly ShopSort[];

function sortHref(query: DirectoryQuery, sort: ShopSort): string {
  const dir = query.sort === sort ? (query.dir === "asc" ? "desc" : "asc") : defaultDirection(sort);
  return directoryHref({ ...query, sort, dir, page: 1 });
}

/** A column header that sorts by its column; the current one shows its direction in words and an arrow. */
function SortHeader({
  query,
  sort,
  align = "left",
}: {
  query: DirectoryQuery;
  sort: ShopSort;
  align?: "left" | "right";
}) {
  const current = query.sort === sort;
  const Arrow = query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={current ? (query.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-semibold", align === "right" ? "text-right" : "text-left")}
    >
      <Link
        href={sortHref(query, sort)}
        className={cn(
          "inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          current ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {SHOP_SORT_LABELS[sort]}
        {current ? <Arrow aria-hidden="true" className="size-3.5" /> : null}
        <span className="sr-only">
          {current ? `, sorted ${query.dir === "asc" ? "smallest, oldest or A to Z first" : "biggest, newest or Z to A first"}` : ", sort by this"}
        </span>
      </Link>
    </th>
  );
}

function SpaceCell({ row }: { row: ShopRow }) {
  return (
    <>
      <span className="font-semibold tabular-nums">{formatBytes(row.storageBytes)}</span>
      <span className="block text-xs text-muted-foreground">
        files {formatBytes(row.fileBytes)}
        {row.database ? ` · records ${formatBytes(row.database.bytes)}` : ""}
      </span>
    </>
  );
}

function ShopCard({ row, now }: { row: ShopRow; now: Date }) {
  const numbers: Array<[string, string]> = [
    ["Staff", formatCount(row.activeStaff)],
    ["Customers", formatCount(row.customers)],
    ["Repairs", formatCount(row.repairs)],
    ["Invoices", formatCount(row.invoices)],
    ["Products", formatCount(row.products)],
    ["Space used", formatBytes(row.storageBytes)],
  ];
  return (
    <li className="relative rounded-lg border border-border bg-surface p-4 hover:border-border-strong hover:bg-surface-hover focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={`/platform/shops/${row.id}`}
          className="min-w-0 break-words text-[17px] font-semibold leading-snug outline-none after:absolute after:inset-0 after:content-['']"
        >
          {row.name}
        </Link>
        <span className="flex flex-wrap gap-1.5">
          <StatusPill status={row.status} />
          {row.isNew ? <NewPill /> : null}
        </span>
      </div>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        {row.owner ? `${row.owner.name} · ${row.owner.email}` : "No owner login"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Joined {formatDate(row.createdAt)} · last active <TimeAgo value={row.lastActiveAt} now={now} />
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-border pt-3">
        {numbers.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-[15px] font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export default async function ShopDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // readShopDirectory() checks the operator session before any cross-shop read.
  const { admin, now, query, totalShops, view, storage } = await readShopDirectory(await searchParams);
  const searching = query.q.length > 0;

  return (
    <ConsoleShell admin={admin} current="shops">
      <PageTitle
        title="Shops"
        intro={`${formatCount(totalShops)} ${totalShops === 1 ? "shop has" : "shops have"} signed up. Search, filter or sort, then tap a shop to see everything about it.`}
      />

      <form role="search" action="/platform/shops" className="flex flex-wrap gap-2">
        <label htmlFor="shop-search" className="sr-only">
          Search shops
        </label>
        <div className="relative min-w-0 flex-1 basis-40">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <input
            id="shop-search"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Shop, owner or email"
            className="h-12 w-full rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base outline-none placeholder:text-faint-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        {query.show !== "all" ? <input type="hidden" name="show" value={query.show} /> : null}
        {query.sort !== "active" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== defaultDirection(query.sort) ? <input type="hidden" name="dir" value={query.dir} /> : null}
        <button
          type="submit"
          className="h-12 rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Search
        </button>
        {searching ? (
          <Link
            href={directoryHref({ ...query, q: "", page: 1 })}
            className="inline-flex h-12 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-4 text-[15px] font-medium hover:bg-surface-hover"
          >
            <X aria-hidden="true" className="size-4" />
            Clear
          </Link>
        ) : null}
      </form>

      <nav aria-label="Show shops" className="mt-4 flex flex-wrap gap-2">
        {SHOP_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={directoryHref({ ...query, show: filter, page: 1 })}
            aria-current={query.show === filter ? "page" : undefined}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[15px] font-medium hover:bg-surface-hover aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            {SHOP_FILTER_LABELS[filter]}
            <span className="tabular-nums opacity-75">{formatCount(view.filterCounts[filter])}</span>
          </Link>
        ))}
      </nav>

      {/* Phones and tablets sort with a plain form; wide screens use the column headers. */}
      <form action="/platform/shops" className="mt-3 flex flex-wrap items-end gap-2 lg:hidden">
        {searching ? <input type="hidden" name="q" value={query.q} /> : null}
        {query.show !== "all" ? <input type="hidden" name="show" value={query.show} /> : null}
        <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
          Sort by
          <select name="sort" defaultValue={query.sort} className="h-11 rounded-md border border-border-strong bg-surface px-3 text-[15px] text-foreground">
            {SHOP_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SHOP_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
          Order
          <select name="dir" defaultValue={query.dir} className="h-11 rounded-md border border-border-strong bg-surface px-3 text-[15px] text-foreground">
            <option value="desc">Biggest, newest or Z to A</option>
            <option value="asc">Smallest, oldest or A to Z</option>
          </select>
        </label>
        <button type="submit" className="h-11 rounded-md border border-border-strong bg-surface px-4 text-[15px] font-semibold hover:bg-surface-hover">
          Sort
        </button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {view.matching === 0
          ? "No shops to show."
          : `Showing ${formatCount(view.rows.length)} of ${formatCount(view.matching)} ${view.matching === 1 ? "shop" : "shops"}${searching ? ` matching “${query.q}”` : ""}, sorted by ${SHOP_SORT_LABELS[query.sort].toLowerCase()}.`}
      </p>

      {view.matching === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
          <p className="text-[17px] font-semibold">{totalShops === 0 ? "No shops have signed up yet." : "No shops match this view."}</p>
          {totalShops > 0 ? (
            <Link href="/platform/shops" className="mt-3 inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4">
              Show every shop
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {view.rows.map((row) => (
              <ShopCard key={row.id} row={row} now={now} />
            ))}
          </ul>

          <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Every shop, with its usage and the space it takes</caption>
              <thead className="border-b border-border bg-surface-hover/60">
                <tr>
                  <SortHeader query={query} sort="name" />
                  <th scope="col" className="px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                  <SortHeader query={query} sort="created" />
                  <SortHeader query={query} sort="active" />
                  {NUMBER_COLUMNS.map((sort) => (
                    <SortHeader key={sort} query={query} sort={sort} align="right" />
                  ))}
                  <SortHeader query={query} sort="storage" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-hover/60">
                    <td className="max-w-[280px] px-3 py-3 align-top">
                      <Link
                        href={`/platform/shops/${row.id}`}
                        className="break-words text-[15px] font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {row.name}
                      </Link>
                      <span className="block break-words text-xs text-muted-foreground">
                        {row.owner ? `${row.owner.name} · ${row.owner.email}` : "No owner login"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="flex flex-wrap gap-1">
                        <StatusPill status={row.status} />
                        {row.isNew ? <NewPill /> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">{formatDate(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                      <TimeAgo value={row.lastActiveAt} now={now} />
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">
                      {formatCount(row.activeStaff)}
                      {row.staff > row.activeStaff ? (
                        <span className="block text-xs text-muted-foreground">{formatCount(row.staff - row.activeStaff)} off</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{formatCount(row.customers)}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{formatCount(row.repairs)}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{formatCount(row.invoices)}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{formatCount(row.products)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                      <SpaceCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view.pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-[15px]">
          {view.page > 1 ? (
            <Link href={directoryHref({ ...query, page: view.page - 1 })} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {view.page} of {view.pages}
          </span>
          {view.page < view.pages ? (
            <Link href={directoryHref({ ...query, page: view.page + 1 })} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-sm leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold text-foreground">Space used</strong> is the shop&apos;s uploaded files (photos, documents, logo; exact sizes) plus its
          database records ({storage.estimateAvailable ? "an estimate" : "not counted this time"}).
        </p>
        <RecountStorage countedAt={storage.countedAt} now={now} />
      </div>
    </ConsoleShell>
  );
}
