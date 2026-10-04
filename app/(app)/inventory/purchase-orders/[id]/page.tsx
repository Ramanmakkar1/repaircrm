import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { lineArrival, poProgressLine } from "@/components/inventory/easy-lists";
import { ProductImage } from "@/components/inventory/product-image";
import { PurchaseOrderActions } from "@/components/inventory/purchase-order-actions";
import { PurchaseOrderHeader } from "@/components/inventory/purchase-order-header";
import {
  PO_STATUS_META,
  asPoStatus,
  poTotals,
} from "@/components/inventory/purchasing";
import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyableId } from "@/components/ui/copyable-id";
import { cn } from "@/components/ui/cn";
import { ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayInputValue, formatDay, formatInstantDay, shopTodayKey } from "@/lib/inventory/dates";
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
  const order = await db.purchaseOrder.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: order ? `Order #${order.number} · Repairs helper` : "Purchase order · Repairs helper",
  };
}

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?receive=1` (the list's "Book in delivery") opens the booking-in sheet on arrival. */
  searchParams?: Promise<{ receive?: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const [{ id }, prefs, query, zone] = await Promise.all([
    params,
    readUiPrefs(),
    searchParams ?? Promise.resolve({} as { receive?: string }),
    shopZone(shopId),
  ]);

  // Scoped by shopId, so a guessed id from another tenant 404s.
  const order = await db.purchaseOrder.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      number: true,
      status: true,
      shippingCents: true,
      notes: true,
      createdAt: true,
      orderedAt: true,
      expectedAt: true,
      receivedAt: true,
      createdBy: { select: { name: true } },
      vendor: {
        select: { id: true, name: true, email: true, phone: true, accountNumber: true },
      },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          receivedQty: true,
          unitCostCents: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              vendorSku: true,
              serialized: true,
              category: true,
              catalogImage: true,
              attachments: PRODUCT_IMAGE_SELECT,
            },
          },
        },
      },
      partOrders: {
        select: {
          id: true,
          description: true,
          quantity: true,
          status: true,
          ticket: { select: { id: true, number: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const totals = poTotals(order.lines, order.shippingCents);
  const status = asPoStatus(order.status);
  const meta = PO_STATUS_META[status];

  // The same six facts in both headers, so Easy mode loses nothing the dense one shows.
  const facts = [
    {
      label: prefs.simple ? "Supplier" : "Vendor",
      value: (
        <Link
          href={`/inventory/vendors/${order.vendor.id}`}
          // A finger target in Easy mode (the dense header keeps its inline link).
          className={cn("font-medium text-accent-soft-foreground hover:underline", prefs.simple && "inline-flex min-h-12 items-center")}
        >
          {order.vendor.name}
        </Link>
      ),
    },
    {
      label: "Received",
      value: (
        <span className="rf-num">
          {totals.receivedQty} of {totals.orderedQty}
        </span>
      ),
    },
    // Raised and placed are moments, read on the shop's clock; the delivery date is a calendar day.
    { label: "Raised", value: formatInstantDay(order.createdAt, zone) },
    {
      label: "Placed",
      value: order.orderedAt ? formatInstantDay(order.orderedAt, zone) : "Not yet",
    },
    {
      label: "Expected",
      value: order.expectedAt ? formatDay(order.expectedAt) : "—",
    },
    { label: "Account", value: order.vendor.accountNumber ?? "—" },
  ];
  const poLines = order.lines.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    receivedQty: line.receivedQty,
    serialized: line.product?.serialized ?? false,
    productId: line.product?.id ?? null,
    category: line.product?.category ?? null,
    catalogImage: line.product?.catalogImage ?? null,
    imageUrl: photoOf(line.product),
  }));
  const progress = poProgressLine(
    { status, expectedAt: order.expectedAt, receivedAt: order.receivedAt },
    totals,
    shopTodayKey(requestNow(), zone),
    zone,
  );
  const heading = `Order #${order.number} from ${order.vendor.name}`;
  const statusPill = <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />;
  const numberChip = <CopyableId value={`PO #${order.number}`} label="purchase order number" />;

  return (
    <div className="flex flex-col gap-6">
      {prefs.simple ? (
        <PurchaseOrderHeader
          title={`Order #${order.number}`}
          status={statusPill}
          supplier={
            <>
              From{" "}
              <Link
                href={`/inventory/vendors/${order.vendor.id}`}
                data-touch-control
                className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4"
              >
                {order.vendor.name}
              </Link>
            </>
          }
          progress={progress}
          total={formatCents(totals.totalCents)}
          actions={
            <PurchaseOrderActions
              easy
              purchaseOrderId={order.id}
              status={order.status}
              vendorEmail={order.vendor.email}
              expectedAt={dayInputValue(order.expectedAt)}
              lines={poLines}
              autoReceive={query.receive === "1"}
              heading={heading}
            >
              <Button variant="outline" asChild className="h-12 px-5 text-base [&_svg]:size-5">
                <Link href={`/print/purchase-orders/${order.id}`}>
                  <ICONS.print />
                  Print
                </Link>
              </Button>
            </PurchaseOrderActions>
          }
        />
      ) : (
        <ObjectHeader
          back={{ label: "Purchase orders", href: "/inventory/purchase-orders" }}
          value={formatCents(totals.totalCents)}
          title={`Purchase order #${order.number}`}
          subtitle={meta.hint}
          status={statusPill}
          id={numberChip}
          meta={facts}
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/print/purchase-orders/${order.id}`}>
                  <ICONS.print />
                  Print
                </Link>
              </Button>
              <PurchaseOrderActions
                size="sm"
                purchaseOrderId={order.id}
                status={order.status}
                vendorEmail={order.vendor.email}
                expectedAt={dayInputValue(order.expectedAt)}
                lines={poLines}
                autoReceive={query.receive === "1"}
                heading={heading}
              />
            </>
          }
        />
      )}

      {prefs.simple ? (
        <EasyOrderBody
          lines={order.lines}
          partOrders={order.partOrders}
          totals={totals}
          notes={order.notes}
          facts={[
            ...facts.filter((fact) => fact.label !== "Received" && fact.label !== "Supplier"),
            { label: "Raised by", value: order.createdBy?.name ?? "—" },
            { label: "Everything arrived", value: order.receivedAt ? formatInstantDay(order.receivedAt, zone) : "Not yet" },
            { label: "Order number", value: `PO #${order.number}` },
          ]}
        />
      ) : null}

      {/* The dense layout: two columns only from xl up, so at a 1024px counter the lines table has the full width and no column hides behind a scrollbar. */}
      {prefs.simple ? null : (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:order-2">
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
            <Row label="Shipping" value={formatCents(totals.shippingCents)} />
            <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Total
              </span>
              <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {formatCents(totals.totalCents)}
              </span>
            </div>

            {/*
              Raised / placed / expected / account used to be repeated here as
              a definition list. They are columns in the header's metadata
              strip now — one place per fact — so this card is only money.
            */}
            <dl className="mt-1 flex flex-col gap-2 border-t border-border pt-3 text-[13px]">
              <Meta label="Raised by" value={order.createdBy?.name ?? "—"} />
              <Meta
                label="Fully received"
                value={order.receivedAt ? formatInstantDay(order.receivedAt, zone) : "Not yet"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="xl:order-1 xl:col-span-2">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
            <CardDescription>
              What was ordered, and how much of each line has arrived.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Table>
              <THead>
                <Tr>
                  <Th>Item</Th>
                  <Th>Vendor SKU</Th>
                  <Th className="text-right">Ordered</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Unit cost</Th>
                  <Th className="text-right">Amount</Th>
                </Tr>
              </THead>
              <TBody>
                {order.lines.map((line) => {
                  const complete = line.receivedQty >= line.quantity;
                  return (
                    <Tr key={line.id}>
                      <Td className="max-w-[18rem]">
                        {line.product ? (
                          <Link
                            href={`/inventory/${line.product.id}`}
                            className="font-semibold text-foreground hover:underline"
                          >
                            {line.description}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">
                            {line.description}
                          </span>
                        )}
                        {line.product?.serialized ? (
                          <Chip icon={ICONS.serial} className="ml-2 align-middle">
                            Serialized
                          </Chip>
                        ) : null}
                      </Td>
                      <Td className="font-mono text-[13px] text-muted-foreground">
                        {line.product?.vendorSku ?? line.product?.sku ?? "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-foreground">
                        {line.quantity}
                      </Td>
                      <Td
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          complete
                            ? "text-status-resolved-fg"
                            : line.receivedQty > 0
                              ? "text-status-in-progress-fg"
                              : "text-muted-foreground",
                        )}
                      >
                        {line.receivedQty}
                      </Td>
                      <Td className="text-right tabular-nums text-muted-foreground">
                        {formatCents(line.unitCostCents)}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums text-foreground">
                        {formatCents(line.quantity * line.unitCostCents)}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>

            {order.notes ? (
              <div className="flex flex-col gap-1.5 border-t border-border px-5 py-5">
                <span className="text-[13px] font-semibold text-muted-foreground">
                  Notes to the vendor
                </span>
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">
                  {order.notes}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
      )}

      {order.partOrders.length > 0 && !prefs.simple ? (
        <Card>
          <CardHeader>
            <CardTitle>Repairs waiting for these parts</CardTitle>
            <CardDescription>
              Booking a line in marks the part as arrived on the repair. The stock
              goes up once, here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {order.partOrders.map((part) => (
              <Link
                key={part.id}
                href={`/tickets/${part.ticket.id}`}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover"
              >
                <ICONS.ticket className="size-3.5 text-faint-foreground" />
                <span className="tabular-nums">#{part.ticket.number}</span>
                <span className="text-muted-foreground">
                  {part.quantity} × {part.description}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** `/files/<id>` of a product's own photo, when it has one. */
function photoOf(product: { attachments?: { id: string }[] } | null): string | null {
  const photo = product?.attachments?.[0];
  return photo ? `/files/${photo.id}` : null;
}

const ARRIVAL_TONE: Record<"Waiting" | "Part arrived" | "All here", StatusTone> = {
  Waiting: "neutral",
  "Part arrived": "active",
  "All here": "success",
};

type OrderLine = {
  id: string;
  description: string;
  quantity: number;
  receivedQty: number;
  unitCostCents: number;
  product: {
    id: string;
    name: string;
    serialized: boolean;
    category?: string | null;
    catalogImage?: string | null;
    attachments?: { id: string }[];
  } | null;
};

/**
 * Easy mode under the header: the order as line cards (picture, name,
 * "ordered 2 · arrived 0" with a status WORD, cost), the repairs waiting on it
 * as chips, one totals line, the note to the supplier, and the remaining facts
 * once, quietly, at the end. No table, so nothing hides behind a scrollbar at a
 * 1024px counter.
 */
function EasyOrderBody({
  lines,
  partOrders,
  totals,
  notes,
  facts,
}: {
  lines: OrderLine[];
  partOrders: { id: string; description: string; quantity: number; status: string; ticket: { id: string; number: number } }[];
  totals: ReturnType<typeof poTotals>;
  notes: string | null;
  facts: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {partOrders.length > 0 ? (
        <section aria-labelledby="po-waiting" className="flex flex-col gap-2">
          <h2 id="po-waiting" className="text-lg font-semibold">
            Waiting for these parts
          </h2>
          <ul className="flex flex-wrap gap-2">
            {partOrders.map((part) => (
              <li key={part.id}>
                <Link
                  href={`/tickets/${part.ticket.id}`}
                  data-touch-control
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ICONS.ticket className="size-4 text-muted-foreground" aria-hidden />
                  Repair #{part.ticket.number}
                  <span className="font-normal text-muted-foreground">
                    {part.quantity} × {part.description}
                    {part.status === "RECEIVED" ? " · arrived" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="po-lines" className="flex flex-col gap-3">
        <h2 id="po-lines" className="text-lg font-semibold">
          On this order
        </h2>
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {lines.map((line) => {
            const arrival = lineArrival(line.quantity, line.receivedQty);
            const picture = (
              <ProductImage
                productId={line.product?.id}
                name={line.product?.name ?? line.description}
                category={line.product?.category}
                catalogImage={line.product?.catalogImage}
                imageUrl={photoOf(line.product)}
                className="size-16 shrink-0 rounded-xl border border-border sm:size-20"
                sizes="80px"
              />
            );
            return (
              <li key={line.id} className="flex items-center gap-4 p-4">
                {line.product ? (
                  <Link href={`/inventory/${line.product.id}`} aria-hidden tabIndex={-1} className="shrink-0">
                    {picture}
                  </Link>
                ) : (
                  picture
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {line.product ? (
                    <Link href={`/inventory/${line.product.id}`} className="text-lg font-semibold leading-tight hover:underline [overflow-wrap:anywhere]">
                      {line.description}
                    </Link>
                  ) : (
                    <span className="text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{line.description}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
                    <span className="rf-num tabular-nums">{arrival.text}</span>
                    <StatusPill tone={ARRIVAL_TONE[arrival.word]} label={arrival.word} />
                    {line.product?.serialized ? <span>· by serial number</span> : null}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span className="rf-num text-lg font-semibold tabular-nums">{formatCents(line.quantity * line.unitCostCents)}</span>
                  <span className="rf-num text-sm text-muted-foreground tabular-nums">{formatCents(line.unitCostCents)} each</span>
                </div>
              </li>
            );
          })}
          {/* The total itself is in the header, once; this line only says what it is made of. */}
          <li className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 bg-surface-hover/60 p-4">
            <span className="rf-num text-[15px] text-muted-foreground tabular-nums">
              Parts {formatCents(totals.subtotalCents)} + shipping {formatCents(totals.shippingCents)}
            </span>
          </li>
        </ul>
      </section>

      {notes ? (
        <section aria-labelledby="po-notes" className="flex flex-col gap-2">
          <h2 id="po-notes" className="text-lg font-semibold">
            Note to the supplier
          </h2>
          <p className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-base leading-relaxed">{notes}</p>
        </section>
      ) : null}

      <section aria-labelledby="po-details" className="flex flex-col gap-2">
        <h2 id="po-details" className="text-lg font-semibold">
          Details
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 break-words text-base font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
