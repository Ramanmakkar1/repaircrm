import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDate } from "@/components/billing/format";
import { PurchaseOrderActions } from "@/components/inventory/purchase-order-actions";
import {
  PO_STATUS_META,
  asPoStatus,
  poTotals,
} from "@/components/inventory/purchasing";
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
import { ICONS } from "@/components/ui/icons";
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
  const order = await db.purchaseOrder.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: order ? `PO #${order.number} · RepairFlow` : "Purchase order · RepairFlow",
  };
}

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const { id } = await params;

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
            select: { id: true, name: true, sku: true, vendorSku: true, serialized: true },
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Breadcrumbs
          className="pb-1.5"
          items={[
            { label: "Inventory", href: "/inventory" },
            { label: "Purchase orders", href: "/inventory/purchase-orders" },
            { label: `#${order.number}` },
          ]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground tabular-nums">
              Purchase order #{order.number}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={meta.tone} label={meta.label} struck={meta.struck} />
              <Link
                href={`/inventory/vendors/${order.vendor.id}`}
                className="text-[13.5px] font-semibold text-accent-soft-foreground hover:underline"
              >
                {order.vendor.name}
              </Link>
              <Chip className="tabular-nums">
                {totals.receivedQty} of {totals.orderedQty} received
              </Chip>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Button variant="outline" asChild>
              <Link href={`/print/purchase-orders/${order.id}`}>
                <ICONS.print />
                Print
              </Link>
            </Button>
            <PurchaseOrderActions
              purchaseOrderId={order.id}
              status={order.status}
              vendorEmail={order.vendor.email}
              expectedAt={dateInput(order.expectedAt)}
              lines={order.lines.map((line) => ({
                id: line.id,
                description: line.description,
                quantity: line.quantity,
                receivedQty: line.receivedQty,
                serialized: line.product?.serialized ?? false,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:order-2">
          <CardHeader>
            <CardTitle>Totals</CardTitle>
            <CardDescription>{meta.hint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
            <Row label="Shipping" value={formatCents(totals.shippingCents)} />
            <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total
              </span>
              <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                {formatCents(totals.totalCents)}
              </span>
            </div>

            <dl className="mt-2 flex flex-col gap-2.5 border-t border-border pt-4 text-[13.5px]">
              <Meta label="Raised" value={formatDate(order.createdAt)} />
              <Meta
                label="Raised by"
                value={order.createdBy?.name ?? "—"}
              />
              <Meta
                label="Placed"
                value={order.orderedAt ? formatDate(order.orderedAt) : "Not yet"}
              />
              <Meta
                label="Expected"
                value={order.expectedAt ? formatDate(order.expectedAt) : "—"}
              />
              <Meta
                label="Received"
                value={order.receivedAt ? formatDate(order.receivedAt) : "—"}
              />
              <Meta label="Account" value={order.vendor.accountNumber ?? "—"} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:order-1 lg:col-span-2">
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

      {order.partOrders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Covering these repairs</CardTitle>
            <CardDescription>
              Ticket part orders riding on this purchase order. Receiving the line
              marks the part received — the stock only moves once, here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {order.partOrders.map((part) => (
              <Link
                key={part.id}
                href={`/tickets/${part.ticket.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-hover"
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

/** A Date -> the yyyy-mm-dd an `<input type="date">` wants, in local time. */
function dateInput(value: Date | null): string {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
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
