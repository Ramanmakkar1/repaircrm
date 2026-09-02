import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDate } from "@/components/billing/format";
import { StockBadge } from "@/components/inventory/stock-badge";
import { PO_STATUS_META, asPoStatus, poTotals } from "@/components/inventory/purchasing";
import { VendorDialog } from "@/components/inventory/vendor-dialog";
import { StatusPill } from "@/components/ui/badge";
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
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Breadcrumbs } from "@/components/ui/page-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireRole("OWNER");
  const { id } = await params;
  const vendor = await db.vendor.findFirst({
    where: { id, shopId },
    select: { name: true },
  });
  return { title: vendor ? `${vendor.name} · RepairFlow` : "Vendor · RepairFlow" };
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const { id } = await params;

  // Scoped by shopId, so a guessed id from another tenant 404s.
  const vendor = await db.vendor.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      website: true,
      accountNumber: true,
      address: true,
      notes: true,
      active: true,
      createdAt: true,
    },
  });
  if (!vendor) notFound();

  const [products, orders] = await Promise.all([
    db.product.findMany({
      where: { shopId, vendorId: vendor.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        vendorSku: true,
        costCents: true,
        stockQty: true,
        lowStockAt: true,
        reorderQty: true,
      },
    }),
    db.purchaseOrder.findMany({
      where: { shopId, vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        number: true,
        status: true,
        shippingCents: true,
        createdAt: true,
        orderedAt: true,
        lines: { select: { quantity: true, unitCostCents: true, receivedQty: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Breadcrumbs
          className="pb-1.5"
          items={[
            { label: "Inventory", href: "/inventory" },
            { label: "Vendors", href: "/inventory/vendors" },
            { label: vendor.name },
          ]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {vendor.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {vendor.accountNumber ? (
                <Chip className="font-mono">Account {vendor.accountNumber}</Chip>
              ) : null}
              <Chip>On file since {formatDate(vendor.createdAt)}</Chip>
              {/* Active/inactive is a status, not a fact-tag — it gets the pill
                  everything else in the app wears. */}
              {!vendor.active ? (
                <StatusPill tone="neutral" label="Inactive" />
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <VendorDialog
              vendor={vendor}
              trigger={
                <Button variant="outline">
                  <ACTIONS.edit />
                  Edit
                </Button>
              }
            />
            <Button asChild>
              <Link href={`/inventory/purchase-orders/new?vendorId=${vendor.id}`}>
                <ACTIONS.add />
                New Purchase Order
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Detail label="Email" value={vendor.email} href={vendor.email ? `mailto:${vendor.email}` : null} />
            <Detail label="Phone" value={vendor.phone} href={vendor.phone ? `tel:${vendor.phone}` : null} />
            <Detail
              label="Website"
              value={vendor.website}
              href={vendor.website ? externalHref(vendor.website) : null}
            />
            <Detail label="Address" value={vendor.address} multiline />
            <Detail label="Notes" value={vendor.notes} multiline />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Products supplied</CardTitle>
            <CardDescription>
              Catalogue items whose vendor is set to {vendor.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {products.length === 0 ? (
              <EmptyState
                icon={ICONS.inventory}
                title="No products yet"
                hint="Set this vendor on a product to see it here — and to have purchase orders fill in its cost and vendor SKU."
                action={
                  <Button variant="outline" asChild>
                    <Link href="/inventory">Open the catalogue</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Product</Th>
                    <Th>Vendor SKU</Th>
                    <Th className="text-right">Cost</Th>
                    <Th className="text-right">Reorder qty</Th>
                    <Th>Stock</Th>
                  </Tr>
                </THead>
                <TBody>
                  {products.map((product) => (
                    <Tr key={product.id}>
                      <Td>
                        <Link
                          href={`/inventory/${product.id}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {product.name}
                        </Link>
                      </Td>
                      <Td className="font-mono text-[13px] text-muted-foreground">
                        {product.vendorSku ?? product.sku ?? "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-foreground">
                        {product.costCents == null ? "—" : formatCents(product.costCents)}
                      </Td>
                      <Td className="text-right tabular-nums text-muted-foreground">
                        {product.reorderQty ?? "—"}
                      </Td>
                      <Td>
                        <StockBadge product={product} />
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
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>
            {orders.length === 0
              ? "Orders raised against this vendor."
              : `The ${orders.length} most recent orders with ${vendor.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {orders.length === 0 ? (
            <EmptyState
              icon={ICONS.purchaseOrder}
              title="Nothing ordered yet"
              hint="Raise a purchase order to record what you asked for, then receive it to move stock and update costs."
              action={
                <Button asChild>
                  <Link href={`/inventory/purchase-orders/new?vendorId=${vendor.id}`}>
                    <ACTIONS.add />
                    New Purchase Order
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>PO</Th>
                  <Th>Status</Th>
                  <Th>Raised</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Total</Th>
                </Tr>
              </THead>
              <TBody>
                {orders.map((order) => {
                  const totals = poTotals(order.lines, order.shippingCents);
                  const meta = PO_STATUS_META[asPoStatus(order.status)];
                  return (
                    <Tr key={order.id}>
                      <Td>
                        <Link
                          href={`/inventory/purchase-orders/${order.id}`}
                          className="font-bold tabular-nums text-accent-soft-foreground hover:underline"
                        >
                          #{order.number}
                        </Link>
                      </Td>
                      <Td>
                        <StatusPill
                          tone={meta.tone}
                          label={meta.label}
                          struck={meta.struck}
                        />
                      </Td>
                      <Td className="text-[13.5px] text-muted-foreground">
                        {formatDate(order.orderedAt ?? order.createdAt)}
                      </Td>
                      <Td className="text-right tabular-nums text-muted-foreground">
                        {totals.receivedQty} / {totals.orderedQty}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums text-foreground">
                        {formatCents(totals.totalCents)}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A bare "vendor.com" still has to become a real link. */
function externalHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function Detail({
  label,
  value,
  href,
  multiline,
}: {
  label: string;
  value: string | null;
  href?: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      {value ? (
        href ? (
          <a
            href={href}
            className="break-words text-[14.5px] font-medium text-accent-soft-foreground hover:underline"
          >
            {value}
          </a>
        ) : (
          <span
            className={cn(
              "text-[14.5px] text-foreground",
              multiline && "whitespace-pre-wrap leading-relaxed",
            )}
          >
            {value}
          </span>
        )
      ) : (
        <span className="text-[14.5px] text-faint-foreground">—</span>
      )}
    </div>
  );
}
