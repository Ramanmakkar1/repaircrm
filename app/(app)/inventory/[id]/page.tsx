import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Tag } from "lucide-react";

import { formatDateTime, initials } from "@/components/customers/format";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { FlashToast } from "@/components/inventory/flash-toast";
import {
  deltaClass,
  marginPct,
  signedQty,
  splitReason,
  STOCK_META,
  STOCK_REASON_META,
  stockStatus,
} from "@/components/inventory/format";
import { ReorderPointEditor } from "@/components/inventory/reorder-point-editor";
import { SerialsCard, type SerialRow } from "@/components/inventory/serials-card";
import { StockBadge } from "@/components/inventory/stock-badge";
import { StatusPill } from "@/components/ui/badge";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

const RECENT = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const product = await db.product.findFirst({
    where: { id, shopId },
    select: { name: true },
  });

  return { title: product ? `${product.name} · RepairPilot` : "Product · RepairPilot" };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;
  const { flash } = await searchParams;
  const showCost = role === "OWNER";

  // Scoped by shopId, so a guessed id from another tenant 404s instead of
  // leaking a row.
  const product = await db.product.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      name: true,
      sku: true,
      upc: true,
      description: true,
      category: true,
      priceCents: true,
      costCents: true,
      taxable: true,
      stockQty: true,
      lowStockAt: true,
      reorderQty: true,
      serialized: true,
      vendorSku: true,
      vendor: { select: { id: true, name: true } },
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!product) notFound();

  const [adjustments, sales, serials] = await Promise.all([
    db.stockAdjustment.findMany({
      where: { shopId, productId: product.id },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: {
        id: true,
        delta: true,
        reason: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    // InvoiceLine carries no shopId of its own — reached through its invoice,
    // which does.
    db.invoiceLine.findMany({
      where: { productId: product.id, invoice: { shopId } },
      orderBy: { invoice: { createdAt: "desc" } },
      take: RECENT,
      select: {
        id: true,
        quantity: true,
        unitPriceCents: true,
        invoice: {
          select: { id: true, number: true, createdAt: true, status: true },
        },
      },
    }),
    // Only serialized products have units; everything else skips the query.
    product.serialized
      ? db.productSerial.findMany({
          where: { shopId, productId: product.id },
          orderBy: [{ status: "asc" }, { serial: "asc" }],
          select: {
            id: true,
            serial: true,
            status: true,
            receivedAt: true,
            soldAt: true,
            notes: true,
            invoiceLine: {
              select: { invoice: { select: { id: true, number: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const serialRows: SerialRow[] = serials.map((unit) => ({
    id: unit.id,
    serial: unit.serial,
    status: unit.status,
    receivedLabel: formatDateTime(unit.receivedAt),
    soldLabel: unit.soldAt ? formatDateTime(unit.soldAt) : null,
    notes: unit.notes,
    invoice: unit.invoiceLine?.invoice ?? null,
  }));

  const inStockSerials = serials
    .filter((unit) => unit.status === "IN_STOCK")
    .map((unit) => ({ id: unit.id, serial: unit.serial }));

  const status = stockStatus(product);
  const meta = STOCK_META[status];
  const margin = marginPct(product.priceCents, product.costCents);
  const soldQty = sales.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
      <FlashToast flash={flash} />

      <div className="flex flex-col gap-1">
        <Breadcrumbs
          className="pb-1.5"
          items={[
            { label: "Inventory", href: "/inventory" },
            { label: product.name },
          ]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {product.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <StockBadge product={product} />
              {product.category ? <Chip icon={Tag}>{product.category}</Chip> : null}
              {/* Retired-from-the-catalogue is a status, so it gets the pill
                  rather than blending in with the grey fact-tags beside it. */}
              {!product.active ? (
                <StatusPill tone="neutral" label="Inactive" />
              ) : null}
              {product.serialized ? (
                <Chip icon={ICONS.serial}>Serialized</Chip>
              ) : null}
              {product.vendor ? (
                <Chip icon={ICONS.vendor}>{product.vendor.name}</Chip>
              ) : null}
              {!product.taxable ? <Chip>Non-taxable</Chip> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Button variant="outline" asChild>
              <Link href={`/print/labels/${product.id}`}>
                <ACTIONS.print />
                Print Labels
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/inventory/${product.id}/edit`}>
                <ACTIONS.edit />
                Edit
              </Link>
            </Button>
            <AdjustStockDialog
              productId={product.id}
              stockQty={product.stockQty}
              serialized={product.serialized}
              serials={inStockSerials}
              trigger={
                <Button>
                  <ICONS.stockMove />
                  Adjust Stock
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------ stock --- */}
        <Card className="lg:order-2">
          <CardHeader>
            <CardTitle>Stock</CardTitle>
            <CardDescription>What&rsquo;s on the shelf right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-2 py-2">
              <span
                className={cn(
                  "text-[64px] font-bold leading-none tabular-nums tracking-tight",
                  meta.text,
                )}
              >
                {product.stockQty}
              </span>
              <span className="text-[13.5px] font-medium text-muted-foreground">
                {status === "untracked" ? "not stock-tracked" : "on hand"}
              </span>
            </div>

            <AdjustStockDialog
              productId={product.id}
              stockQty={product.stockQty}
              serialized={product.serialized}
              serials={inStockSerials}
              trigger={
                <Button variant="soft" size="lg" className="w-full">
                  <ICONS.stockMove />
                  Adjust Stock
                </Button>
              }
            />

            <div className="border-t border-border pt-4">
              <ReorderPointEditor
                productId={product.id}
                lowStockAt={product.lowStockAt}
              />
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------------- info --- */}
        <Card className="lg:order-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Stat label="Price" value={formatCents(product.priceCents)} big />
              {showCost ? (
                <Stat
                  label="Cost"
                  value={
                    product.costCents == null ? "—" : formatCents(product.costCents)
                  }
                  big
                />
              ) : null}
              {showCost ? (
                <Stat label="Margin" value={margin == null ? "—" : `${margin}%`} big />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-3">
              <Stat label="SKU" value={product.sku ?? "—"} mono />
              <Stat label="UPC" value={product.upc ?? "—"} mono />
              <Stat label="Category" value={product.category ?? "Uncategorised"} />
              <Stat label="Taxable" value={product.taxable ? "Yes" : "No"} />
              <Stat label="Vendor" value={product.vendor?.name ?? "—"} />
              <Stat label="Vendor SKU" value={product.vendorSku ?? "—"} mono />
              <Stat
                label="Reorder qty"
                value={product.reorderQty == null ? "Auto" : String(product.reorderQty)}
              />
              <Stat label="Added" value={formatDateTime(product.createdAt)} />
              <Stat label="Last edited" value={formatDateTime(product.updatedAt)} />
            </div>

            {product.description ? (
              <div className="flex flex-col gap-1.5 border-t border-border pt-5">
                <span className="text-[13px] font-semibold text-muted-foreground">
                  Description
                </span>
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">
                  {product.description}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {product.serialized ? (
        <SerialsCard productId={product.id} serials={serialRows} />
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ------------------------------------------------ adjustments --- */}
        <Card>
          <CardHeader>
            <CardTitle>Stock history</CardTitle>
            <CardDescription>
              The last {RECENT} adjustments, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {adjustments.length === 0 ? (
              <EmptyState
                icon={History}
                title="No adjustments yet"
                hint="Receiving, selling or counting this product will show up here."
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>When</Th>
                    <Th>Who</Th>
                    <Th className="text-right">Change</Th>
                    <Th>Reason</Th>
                  </Tr>
                </THead>
                <TBody>
                  {adjustments.map((row) => (
                    <Tr key={row.id}>
                      <Td className="text-[13.5px] text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </Td>
                      <Td>
                        {row.user ? (
                          <span className="flex items-center gap-2">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-soft-foreground">
                              {initials(row.user.name)}
                            </span>
                            <span
                              className="max-w-[7rem] truncate text-[13.5px] font-medium text-muted-foreground"
                              title={row.user.name}
                            >
                              {row.user.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[13.5px] text-faint-foreground">
                            System
                          </span>
                        )}
                      </Td>
                      <Td
                        className={cn(
                          "text-right text-[15px] font-bold tabular-nums",
                          deltaClass(row.delta),
                        )}
                      >
                        {signedQty(row.delta)}
                      </Td>
                      <Td>
                        <ReasonCell reason={row.reason} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------ sales --- */}
        <Card>
          <CardHeader>
            <CardTitle>Sales history</CardTitle>
            <CardDescription>
              {sales.length === 0
                ? "Invoices that included this product."
                : `${soldQty} sold across the last ${sales.length} invoice${
                    sales.length === 1 ? "" : "s"
                  }.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {sales.length === 0 ? (
              <EmptyState
                icon={ICONS.invoice}
                title="Not sold yet"
                hint="Once this product lands on an invoice it'll be listed here."
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Invoice</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Price</Th>
                  </Tr>
                </THead>
                <TBody>
                  {sales.map((line) => (
                    <Tr key={line.id}>
                      <Td>
                        <Link
                          href={`/invoices/${line.invoice.id}`}
                          className="font-bold text-accent-soft-foreground tabular-nums hover:underline"
                        >
                          #{line.invoice.number}
                        </Link>
                      </Td>
                      <Td className="text-[13.5px] text-muted-foreground">
                        {formatDateTime(line.invoice.createdAt)}
                      </Td>
                      <Td className="text-right text-[15px] font-bold tabular-nums text-foreground">
                        {line.quantity}
                      </Td>
                      <Td className="text-right text-[13.5px] text-muted-foreground tabular-nums">
                        {formatCents(line.unitPriceCents)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
              <ICONS.barcode className="size-5" strokeWidth={2.25} />
            </span>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold text-foreground">
                Shelf labels
              </span>
              <span className="text-[13.5px] text-muted-foreground">
                A printable sheet with the name, price and a Code128 barcode of{" "}
                <span className="font-mono">
                  {product.sku ?? product.upc ?? product.id}
                </span>
                .
              </span>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/print/labels/${product.id}`}>
              <ACTIONS.print />
              Print Labels
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * "Received — 2 boxes from Mobilesentrix" reads as a pill plus the note that
 * came with it: the kind is scannable down the column, and the operator's own
 * words stay in their own voice rather than being swallowed by a chip.
 */
function ReasonCell({ reason }: { reason: string }) {
  const { kind, note } = splitReason(reason);

  return (
    <span className="flex min-w-0 items-center gap-2">
      {kind ? (
        <StatusPill
          tone={STOCK_REASON_META[kind].tone}
          label={kind}
          size="sm"
          className="shrink-0"
        />
      ) : null}
      {note ? (
        <span
          // With a pill beside it the note is the aside; on its own — a reason
          // written before the vocabulary existed — it is the whole cell.
          className={cn(
            // A max width rather than `min-w-0`: a table cell is sized by its
            // content, so only a hard cap stops one long note from widening
            // the column without limit. The four columns together are still
            // wider than this half-width card, so the table scrolls inside its
            // own container — the cap keeps that scroll short rather than
            // unbounded.
            "truncate text-[13.5px]",
            kind ? "max-w-[12rem] text-muted-foreground" : "max-w-[14rem] text-foreground",
          )}
          title={note}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}

function Stat({
  label,
  value,
  big,
  mono,
}: {
  label: string;
  value: string;
  big?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "truncate font-bold text-foreground tabular-nums",
          big ? "text-[22px] leading-tight" : "text-[15px]",
          mono && "font-mono text-[14px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
