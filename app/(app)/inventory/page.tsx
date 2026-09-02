import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
  Store,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { plural } from "@/components/customers/format";
import { asFilter, type InventoryFilter } from "@/components/inventory/format";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { ProductCard } from "@/components/inventory/product-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Inventory · RepairFlow" };

const PAGE_SIZE = 24;

type SearchParams = {
  q?: string;
  filter?: string;
  category?: string;
  page?: string;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { shopId, role } = await requireUser();
  const params = await searchParams;

  const query = (params.q ?? "").trim();
  const filter = asFilter(params.filter);
  const category = (params.category ?? "").trim();
  const showCost = role === "OWNER";

  const where = buildWhere(shopId, query, filter, category);

  // Count first so an out-of-range ?page= clamps to the last real page instead
  // of rendering an "add your first product" empty state over a full list.
  const total = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  );

  const [products, categoryRows, lowStockCount] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        sku: true,
        upc: true,
        category: true,
        priceCents: true,
        costCents: true,
        stockQty: true,
        lowStockAt: true,
        active: true,
      },
    }),
    db.product.findMany({
      where: { shopId, category: { not: null } },
      distinct: ["category"],
      orderBy: { category: "asc" },
      select: { category: true },
    }),
    db.product.count({ where: lowStockWhere(shopId) }),
  ]);

  const categories = categoryRows
    .map((row) => row.category)
    .filter((value): value is string => Boolean(value));

  const filtered = filter !== "all" || query !== "" || category !== "";
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventory"
        description="Every part, accessory and service the shop sells, with what's on the shelf."
        actions={
          <>
            {/* Purchasing lives one level in, reachable from here rather than
                from the sidebar — the rail is already thirteen items long and
                these are inventory's own sub-pages. Owner only, like the pages
                themselves. */}
            {showCost ? (
              <>
                <Button variant="outline" asChild>
                  <Link href="/inventory/vendors">
                    <Store />
                    Vendors
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/inventory/purchase-orders">
                    <ClipboardList />
                    Purchase orders
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/inventory/import">
                    <Upload />
                    Import
                  </Link>
                </Button>
              </>
            ) : null}
            <Button asChild>
              <Link href="/inventory/new">
                <Plus />
                New Product
              </Link>
            </Button>
          </>
        }
      />

      {/* Only worth interrupting for when nothing is filtered — inside a
          filtered view the grid already answers the question. */}
      {lowStockCount > 0 && !filtered ? (
        <Link
          href="/inventory?filter=low"
          className="rf-lift flex items-center gap-4 rounded-lg border border-status-in-progress/25 bg-status-in-progress-bg p-5 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-status-in-progress/15 text-status-in-progress-fg">
            <TriangleAlert className="size-5" strokeWidth={2.25} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-bold text-status-in-progress-fg">
              {plural(lowStockCount, "product")} at or below{" "}
              {lowStockCount === 1 ? "its" : "their"} reorder point
            </span>
            <span className="text-[13.5px] text-status-in-progress-fg/80">
              Review what needs ordering before the bench runs dry.
            </span>
          </span>
          <ChevronRight className="ml-auto size-5 shrink-0 text-status-in-progress-fg" />
        </Link>
      ) : null}

      <div className="flex flex-col gap-3">
        <InventoryFilters
          filter={filter}
          query={query}
          category={category}
          categories={categories}
        />
        <p className="text-[13.5px] font-medium text-muted-foreground tabular-nums">
          {total === 0
            ? "No products"
            : `Showing ${firstRow}–${lastRow} of ${plural(total, "product")}`}
        </p>
      </div>

      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Boxes}
            title={filtered ? "Nothing matches those filters" : "No products yet"}
            hint={
              filtered
                ? "Try a shorter search, or clear the filters to see the whole catalogue."
                : "Add the parts and services you sell so they're one click away on tickets and invoices."
            }
            action={
              filtered ? (
                <Button variant="outline" asChild>
                  <Link href="/inventory">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/inventory/new">
                    <Plus />
                    New Product
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} showCost={showCost} />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <p className="text-[13.5px] font-medium text-muted-foreground tabular-nums">
            Page {page} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <PageLink
              href={pageHref(params, page - 1)}
              disabled={page <= 1}
              label="Previous"
            >
              <ChevronLeft />
              Previous
            </PageLink>
            <PageLink
              href={pageHref(params, page + 1)}
              disabled={page >= pageCount}
              label="Next"
            >
              Next
              <ChevronRight />
            </PageLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "At or below the reorder point", expressed once.
 *
 * `lowStockAt >= stockQty` is a same-row column comparison (a Prisma field
 * reference). Writing it on the NULLABLE side is deliberate: a product with no
 * reorder point yields NULL, which SQL drops from the result — exactly the
 * "not stock-tracked" behaviour the badge shows, with no extra clause.
 */
function lowStockWhere(shopId: string): Prisma.ProductWhereInput {
  return {
    shopId,
    active: true,
    lowStockAt: { gte: db.product.fields.stockQty },
  };
}

function buildWhere(
  shopId: string,
  query: string,
  filter: InventoryFilter,
  category: string,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { shopId };

  // The pills mirror the badge rules exactly, so a card can never show green
  // inside the "Low stock" view.
  if (filter === "low") {
    where.active = true;
    where.lowStockAt = { gte: db.product.fields.stockQty };
  } else if (filter === "out") {
    where.active = true;
    where.stockQty = { lte: 0 };
    // Tracked items only: labour and services sit at 0 forever by design.
    where.lowStockAt = { not: null };
  } else if (filter === "inactive") {
    where.active = false;
  }

  if (category) where.category = category;

  // Every whitespace-separated token must match at least one field, so
  // "iphone screen" finds the screen assembly and "iphone keyboard" finds
  // nothing.
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
    where.AND = tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" as const } },
        { sku: { contains: token, mode: "insensitive" as const } },
        { upc: { contains: token, mode: "insensitive" as const } },
      ],
    }));
  }

  return where;
}

function pageHref(params: SearchParams, page: number): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.category?.trim()) search.set("category", params.category.trim());
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" asChild>
      <Link href={href} aria-label={label} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
