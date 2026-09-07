import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { StatusPill } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ConfirmActionDialog } from "@/components/billing/action-form";
import { formatDate } from "@/components/billing/format";
import { customerLabel } from "@/components/billing/queries";
import { refundAwareTotals } from "@/components/billing/refund-math";
import { InvoiceStatusBadge } from "@/components/billing/status-badge";
import {
  FREQUENCY_CADENCE,
  SCHEDULE_STATE_META,
  advanceRunDate,
  asFrequency,
  frequencyLabel,
  isDue,
  scheduleState,
} from "@/components/recurring/meta";
import {
  RunNowButton,
  ScheduleActiveButton,
} from "@/components/recurring/schedule-controls";
import { deleteScheduleAction } from "../actions";

const LINK_CHIP =
  "transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    select: { name: true },
  });
  return {
    title: schedule
      ? `${schedule.name} · RepairFlow`
      : "Recurring schedule · RepairFlow",
  };
}

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const { id } = await params;

  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      lines: { orderBy: { sortOrder: "asc" } },
      invoices: {
        orderBy: { number: "desc" },
        include: {
          lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          payments: { select: { amountCents: true } },
          // Same reason as the invoice list: a refund walks the stored status
          // back to PARTIAL, so a balance that ignored refunds would print
          // "Paid" in the row beside a "Partial" badge.
          refunds: { select: { amountCents: true, status: true } },
        },
      },
    },
  });
  if (!schedule) notFound();

  const totals = calcTotals(schedule.lines, schedule.taxRateBps);
  const frequency = asFrequency(schedule.frequency);
  const due = isDue(schedule.nextRunAt, schedule.active);
  const state = SCHEDULE_STATE_META[scheduleState(schedule.active, due)];
  const name = customerLabel(schedule.customer);
  const generatedCount = schedule.invoices.length;
  const canDelete = role === "OWNER" && generatedCount === 0;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: "Invoices", href: "/invoices" },
          { label: "Recurring", href: "/invoices/recurring" },
          { label: schedule.name },
        ]}
      />

      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-3xl font-bold leading-tight tracking-tight text-foreground">
                  {schedule.name}
                </span>
                <StatusPill tone={state.tone} label={state.label} />
              </div>
              <Link
                href={`/customers/${schedule.customer.id}`}
                className="w-fit text-lg font-semibold text-foreground transition-colors hover:text-accent"
              >
                {name}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <RunNowButton scheduleId={schedule.id} />
              <Button variant="outline" asChild>
                <Link href={`/invoices/recurring/${schedule.id}/edit`}>
                  <ACTIONS.edit /> Edit
                </Link>
              </Button>
              <ScheduleActiveButton
                scheduleId={schedule.id}
                active={schedule.active}
                scheduleName={schedule.name}
              />
              {role === "OWNER" ? (
                <ConfirmActionDialog
                  action={deleteScheduleAction}
                  fields={{ id: schedule.id }}
                  triggerLabel="Delete"
                  triggerIcon={<ACTIONS.delete />}
                  title={`Delete ${schedule.name}?`}
                  description="The schedule and its line items go for good. This can't be undone."
                  confirmLabel="Delete schedule"
                  disabled={!canDelete}
                  disabledReason={
                    generatedCount > 0
                      ? `This schedule has raised ${generatedCount} invoice${
                          generatedCount === 1 ? "" : "s"
                        } — pause it instead so the billing history stays intact.`
                      : undefined
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Chip icon={ICONS.recurring}>
              {frequencyLabel(frequency)} · {FREQUENCY_CADENCE[frequency]}
            </Chip>
            <Chip
              icon={ICONS.dueDate}
              className={cn(
                due && "bg-status-overdue-bg font-bold text-status-overdue-fg",
              )}
            >
              {due ? "Due " : "Next run "}
              {formatDate(schedule.nextRunAt)}
            </Chip>
            <Chip icon={ICONS.deposit}>
              {schedule.dueInDays === 0
                ? "Due on receipt"
                : `Net ${schedule.dueInDays} days`}
            </Chip>
            <Chip icon={ICONS.invoice}>
              {generatedCount} invoice{generatedCount === 1 ? "" : "s"} generated
            </Chip>
            {schedule.autoSend ? <Chip icon={ICONS.email}>Auto-send</Chip> : null}
            {schedule.autoCharge ? (
              <Chip
                icon={ICONS.payment}
                className="bg-chip-accent-bg text-chip-accent-fg"
              >
                Auto-charge
              </Chip>
            ) : null}
            <Link href={`/customers/${schedule.customer.id}`}>
              <Chip icon={ICONS.customer} className={LINK_CHIP}>
                {name}
              </Chip>
            </Link>
          </div>

          {/* The full reason, not the list page's tooltip. This is where
              someone lands when they want to know what to do about it. */}
          {schedule.lastChargeError ? (
            <p className="flex items-start gap-2.5 rounded-md bg-destructive-soft px-4 py-3 text-[13.5px] font-medium leading-relaxed text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                The last automatic charge failed: {schedule.lastChargeError} The
                invoice was still raised. This clears itself once a charge goes
                through.
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* --------------------------------------------------------- lines */}
        <Card>
          <CardHeader icon={ICONS.checklist} title="What gets billed each run" />
          <CardContent className="px-0 py-0">
            {schedule.lines.length === 0 ? (
              <EmptyState
                icon={ICONS.invoice}
                title="No line items"
                hint="This schedule cannot run until it has something to bill."
                action={
                  <Button variant="outline" asChild>
                    <Link href={`/invoices/recurring/${schedule.id}/edit`}>
                      <ACTIONS.add /> Add lines
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Description</Th>
                      <Th className="w-[70px] text-right">Qty</Th>
                      <Th className="w-[110px] text-right">Unit</Th>
                      <Th className="w-[70px] text-center">Tax</Th>
                      <Th className="w-[120px] text-right">Amount</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {schedule.lines.map((line) => (
                      <Tr key={line.id}>
                        <Td className="font-medium text-foreground">
                          {line.description}
                        </Td>
                        <Td className="text-right tabular-nums">{line.quantity}</Td>
                        <Td className="text-right tabular-nums">
                          {formatCents(line.unitPriceCents)}
                        </Td>
                        <Td className="text-center text-muted-foreground">
                          {line.taxable ? "Yes" : "—"}
                        </Td>
                        <Td className="text-right font-semibold tabular-nums text-foreground">
                          {formatCents(line.quantity * line.unitPriceCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- totals */}
        <Card>
          <CardHeader icon={ICONS.cash} title="Per-run total" />
          <CardContent className="flex flex-col gap-3">
            <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
            <TotalRow
              label={`Tax (${formatBps(schedule.taxRateBps)})`}
              value={formatCents(totals.taxCents)}
            />
            <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total
              </span>
              <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                {formatCents(totals.totalCents)}
              </span>
            </div>
            <p className="border-t border-border pt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Runs {FREQUENCY_CADENCE[frequency]}. After the{" "}
              {formatDate(schedule.nextRunAt)} run the next one lands on{" "}
              <span className="font-semibold text-foreground">
                {formatDate(advanceRunDate(schedule.nextRunAt, frequency, schedule.anchorDay))}
              </span>
              , whenever you actually press run.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------- generated list */}
      <Card>
        <CardHeader icon={ICONS.invoice} title="Generated invoices" />
        <CardContent className="px-0 py-0">
          {schedule.invoices.length === 0 ? (
            <EmptyState
              icon={ICONS.invoice}
              title="Nothing raised yet"
              hint={`The first draft appears here on ${formatDate(schedule.nextRunAt)} — or press "Run now" to bill this period early.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-[110px]">Invoice</Th>
                    <Th className="w-[140px]">Raised</Th>
                    <Th className="w-[130px]">Status</Th>
                    <Th className="w-[140px]">Due</Th>
                    <Th className="w-[130px] text-right">Total</Th>
                    <Th className="w-[130px] text-right">Balance</Th>
                  </Tr>
                </THead>
                <TBody>
                  {schedule.invoices.map((invoice) => {
                    const invTotals = refundAwareTotals(
                      invoice.lines,
                      invoice.taxRateBps,
                      invoice.payments,
                      invoice.refunds,
                    );
                    const settled =
                      invoice.status !== "VOID" && invTotals.balanceCents <= 0;
                    return (
                      <Tr key={invoice.id}>
                        <Td>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="inline-flex items-center gap-1 font-semibold tabular-nums text-foreground transition-colors hover:text-accent"
                          >
                            <ICONS.serial className="size-3.5 text-faint-foreground" />
                            {invoice.number}
                          </Link>
                        </Td>
                        <Td className="tabular-nums text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </Td>
                        <Td>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Td>
                        <Td className="tabular-nums text-muted-foreground">
                          {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}
                        </Td>
                        <Td className="text-right font-semibold tabular-nums text-foreground">
                          {formatCents(invTotals.totalCents)}
                        </Td>
                        <Td
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            settled ? "text-status-resolved-fg" : "text-foreground",
                          )}
                        >
                          {invoice.status === "VOID"
                            ? "—"
                            : settled
                              ? "Paid"
                              : formatCents(invTotals.balanceCents)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
