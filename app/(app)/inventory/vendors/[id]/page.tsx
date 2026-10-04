import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Globe, Phone } from "lucide-react";

import { stockCount } from "@/components/inventory/easy-lists";
import { stockStatus } from "@/components/inventory/format";
import { ProductImage } from "@/components/inventory/product-image";
import { PurchaseOrderCard, type PurchaseOrderCardData } from "@/components/inventory/purchase-order-card";
import { RecordWithActions, FOOTER_ACTION } from "@/components/inventory/record-with-actions";
import { orderMoreHref } from "@/components/inventory/restock";
import { StockBadge, StockFlag } from "@/components/inventory/stock-badge";
import { PO_STATUS_META, asPoStatus, poTotals } from "@/components/inventory/purchasing";
import { VendorActions } from "@/components/inventory/vendor-actions";
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
import { InitialsVisual, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatInstantDay, shopTodayKey } from "@/lib/inventory/dates";
import { PRODUCT_IMAGE_SELECT } from "@/lib/inventory/product-images";
import { shopZone } from "@/lib/inventory/shop-zone";
import { formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";

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
  return { title: vendor ? `${vendor.name} · Repairs helper` : "Supplier · Repairs helper" };
}

export default async function VendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const [{ id }, prefs, zone] = await Promise.all([params, readUiPrefs(), shopZone(shopId)]);

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
        vendorId: true,
        active: true,
        category: true,
        catalogImage: true,
        attachments: PRODUCT_IMAGE_SELECT,
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
        expectedAt: true,
        receivedAt: true,
        lines: { select: { quantity: true, unitCostCents: true, receivedQty: true } },
      },
    }),
  ]);

  if (prefs.simple) {
    return <EasyVendor vendor={vendor} products={products} orders={orders} zone={zone} />;
  }

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
              <Chip>On file since {formatInstantDay(vendor.createdAt, zone)}</Chip>
              {/* Active/inactive is a status, not a fact-tag — it gets the pill
                  everything else in the app wears. */}
              {!vendor.active ? (
                <StatusPill tone="neutral" label="Inactive" />
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:justify-end">
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

      {/* Side by side only from xl up: at a 1024px counter the products table gets the full width, so no column hides. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-1">
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

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Products supplied</CardTitle>
            <CardDescription>
              Products that name {vendor.name} as their supplier.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {products.length === 0 ? (
              <EmptyState
                icon={ICONS.inventory}
                title="No products yet"
                hint="Choose this supplier on a product to see it here. New orders then fill in its cost and the supplier's part number."
                action={
                  <Button variant="outline" asChild>
                    <Link href="/inventory">Open stock</Link>
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
              : orders.length === 1
                ? `The one order with ${vendor.name} so far.`
                : `The ${orders.length} most recent orders with ${vendor.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {orders.length === 0 ? (
            <EmptyState
              icon={ICONS.purchaseOrder}
              title="Nothing ordered yet"
              hint="Raise an order to record what you asked for, then book the delivery in when it arrives."
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
                        {formatInstantDay(order.orderedAt ?? order.createdAt, zone)}
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

type VendorRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  accountNumber: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
};

type VendorProduct = {
  id: string;
  name: string;
  sku: string | null;
  vendorSku: string | null;
  costCents: number | null;
  stockQty: number;
  lowStockAt: number | null;
  reorderQty: number | null;
  vendorId: string | null;
  active: boolean;
  category: string | null;
  catalogImage: string | null;
  attachments: { id: string }[];
};

/**
 * The supplier in Easy mode: who they are (initials, name), the three things you
 * do with a supplier as big buttons (New order, Call, Email), what is on order
 * with them as order cards, what you buy from them as picture cards (stock in
 * words, "Order more" on anything low), and the contact details quietly at the
 * end. No tables, so nothing is cut off at a 1024px counter. "Supplier"
 * everywhere, and the supplier's own code is "their part number".
 */
function EasyVendor({
  vendor,
  products,
  orders,
  zone,
}: {
  vendor: VendorRecord;
  products: VendorProduct[];
  orders: Omit<PurchaseOrderCardData, "vendor">[];
  zone: string;
}) {
  const todayKey = shopTodayKey(requestNow(), zone);
  const open = orders.filter((order) => ["DRAFT", "ORDERED", "PARTIAL"].includes(order.status));
  const past = orders.filter((order) => !["DRAFT", "ORDERED", "PARTIAL"].includes(order.status));
  const big = "h-12 px-5 text-base [&_svg]:size-5";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <InitialsVisual name={vendor.name} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{vendor.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
              {vendor.active ? <span>Supplier</span> : <StatusPill tone="neutral" label="Inactive" />}
              {vendor.accountNumber ? <span>Your account: {vendor.accountNumber}</span> : null}
              <span>Since {formatInstantDay(vendor.createdAt, zone)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vendor.active ? (
            <Button asChild className={big}>
              <Link href={`/inventory/purchase-orders/new?vendorId=${vendor.id}`}>
                <ACTIONS.add />
                New order
              </Link>
            </Button>
          ) : null}
          {vendor.phone ? (
            <Button variant="outline" asChild className={big}>
              <a href={`tel:${vendor.phone.replace(/[^0-9+]/g, "")}`}>
                <Phone aria-hidden />
                Call
              </a>
            </Button>
          ) : null}
          {vendor.email ? (
            <Button variant="outline" asChild className={big}>
              <a href={`mailto:${vendor.email}`}>
                <ACTIONS.email />
                Email
              </a>
            </Button>
          ) : null}
          <VendorActions vendor={vendor} easy />
        </div>
      </section>

      <section aria-labelledby="vendor-open" className="flex flex-col gap-3">
        <h2 id="vendor-open" className="text-lg font-semibold">
          On order with them <span className="rf-num text-muted-foreground">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-base text-muted-foreground">
            Nothing on order. {vendor.active ? "Tap New order when you need something from them." : null}
          </p>
        ) : (
          <RecordGrid>
            {open.map((order) => (
              <PurchaseOrderCard key={order.id} order={{ ...order, vendor: { id: vendor.id, name: vendor.name } }} todayKey={todayKey} zone={zone} />
            ))}
          </RecordGrid>
        )}
      </section>

      <section aria-labelledby="vendor-parts" className="flex flex-col gap-3">
        <h2 id="vendor-parts" className="text-lg font-semibold">
          Parts from this supplier <span className="rf-num text-muted-foreground">({products.length})</span>
        </h2>
        {products.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-4">
            <p className="text-base text-muted-foreground">
              No products name this supplier yet. Choose them as the supplier on a product, and new orders fill in its cost for you.
            </p>
            <Button variant="outline" asChild className={big}>
              <Link href="/inventory">Open stock</Link>
            </Button>
          </div>
        ) : (
          <RecordGrid>
            {products.map((product) => {
              const count = stockCount(product);
              const low = product.active && ["low", "out"].includes(stockStatus(product));
              const card = {
                href: `/inventory/${product.id}`,
                visual: (
                  <ProductImage
                    productId={product.id}
                    name={product.name}
                    category={product.category}
                    catalogImage={product.catalogImage}
                    imageUrl={product.attachments[0] ? `/files/${product.attachments[0].id}` : null}
                    className="size-20 rounded-xl border border-border sm:size-24"
                    sizes="96px"
                  />
                ),
                title: <span className="block line-clamp-2 whitespace-normal break-words">{product.name}</span>,
                subtitle: (
                  <>
                    <span className="block">{product.costCents == null ? "No cost yet" : `Costs ${formatCents(product.costCents)}`}</span>
                    {product.vendorSku ? <span className="block truncate">Their part number: {product.vendorSku}</span> : null}
                  </>
                ),
                status: product.active ? null : <StatusPill tone="neutral" label="Inactive" />,
                trailing: (
                  <span className="flex h-full min-w-14 flex-col items-end justify-center gap-1.5">
                    <span className="flex flex-col items-end leading-none">
                      <span className="rf-num text-[28px] font-semibold tabular-nums">{count.value}</span>
                      <span className="mt-1 text-right text-sm leading-tight text-muted-foreground">{count.unit}</span>
                    </span>
                    {product.active ? <StockFlag product={product} size="md" /> : null}
                  </span>
                ),
              };
              return low ? (
                <RecordWithActions
                  key={product.id}
                  {...card}
                  actions={
                    <Button variant="ghost" asChild className={`${FOOTER_ACTION} font-semibold text-foreground`}>
                      <Link href={orderMoreHref(product)} aria-label={`Order more ${product.name}`}>
                        Order more
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <li key={product.id} className="flex">
                  <RecordCard className="min-w-0 flex-1" {...card} />
                </li>
              );
            })}
          </RecordGrid>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="vendor-past" className="flex flex-col gap-3">
          <h2 id="vendor-past" className="text-lg font-semibold">
            Past orders <span className="rf-num text-muted-foreground">({past.length})</span>
          </h2>
          <RecordGrid>
            {past.map((order) => (
              <PurchaseOrderCard key={order.id} order={{ ...order, vendor: { id: vendor.id, name: vendor.name } }} todayKey={todayKey} zone={zone} />
            ))}
          </RecordGrid>
        </section>
      ) : null}

      <section aria-labelledby="vendor-contact" className="flex flex-col gap-3">
        <h2 id="vendor-contact" className="text-lg font-semibold">
          Contact and notes
        </h2>
        <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
          <EasyDetail label="Phone" value={vendor.phone} href={vendor.phone ? `tel:${vendor.phone.replace(/[^0-9+]/g, "")}` : null} />
          <EasyDetail label="Email" value={vendor.email} href={vendor.email ? `mailto:${vendor.email}` : null} />
          <EasyDetail label="Website" value={vendor.website} href={vendor.website ? externalHref(vendor.website) : null} icon={<Globe className="size-4" aria-hidden />} />
          <EasyDetail label="Address" value={vendor.address} />
          <div className="sm:col-span-2">
            <EasyDetail label="Notes" value={vendor.notes} />
          </div>
        </dl>
      </section>
    </div>
  );
}

function EasyDetail({ label, value, href, icon }: { label: string; value: string | null; href?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-base">
        {value ? (
          href ? (
            <a href={href} className="inline-flex min-h-12 items-center gap-1.5 font-semibold underline underline-offset-4 [overflow-wrap:anywhere]">
              {icon}
              {value}
            </a>
          ) : (
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</span>
          )
        ) : (
          <span className="text-muted-foreground">Not given</span>
        )}
      </dd>
    </div>
  );
}

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
            className="[overflow-wrap:anywhere] text-[14.5px] font-medium text-accent-soft-foreground hover:underline"
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
