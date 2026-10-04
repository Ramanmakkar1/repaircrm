import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { safeTimeZone } from "@/lib/dashboard/logic";
import { taxLabel } from "@/lib/tax";
import { primaryPhone } from "@/components/customers/customer-facts";
import { BillSummary } from "@/components/billing/bill-hero";
import { EmptyLines, LineList, Section, TotalsBlock, type TotalRow as BillTotalRow } from "@/components/billing/bill-lines";
import { DocumentGrid, InvoiceCard } from "@/components/billing/document-cards";
import { shopNow, shopWall } from "@/components/billing/shop-clock";
import { BIG_BUTTON_SLOT, TILE_CLASS } from "@/components/billing/tile-style";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
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
      ? `${schedule.name} · Repairs helper`
      : "Recurring schedule · Repairs helper",
  };
}

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, { simple }] = await Promise.all([params, readUiPrefs()]);

  const schedule = await db.recurringInvoice.findFirst({
    where: { id, shopId },
    include: {
      shop: { select: { timezone: true } },
      taxRate: { select: { name: true } },
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
  // The run date is a calendar day; "is it due?" is asked on the shop's own clock.
  const zone = safeTimeZone(schedule.shop.timezone);
  const wallNow = shopNow(requestNow(), zone);
  const due = isDue(schedule.nextRunAt, schedule.active, wallNow);
  const state = SCHEDULE_STATE_META[scheduleState(schedule.active, due)];
  const name = customerLabel(schedule.customer);
  const generatedCount = schedule.invoices.length;
  const canDelete = role === "OWNER" && generatedCount === 0;

  // The two chips the header used to carry, as one column. "Manual" rather
  // than an empty cell: a schedule nobody automated is a fact, not a blank.
  const automation = [
    schedule.autoSend ? "Emails each bill" : null,
    schedule.autoCharge ? "Charges the card" : null,
  ].filter((label): label is string => label !== null);
  const terms = schedule.dueInDays === 0 ? "Due on receipt" : `Pay within ${schedule.dueInDays} days`;

  // ============================================================== Easy
  // The same till as an invoice: what goes on each bill on the left, and on
  // the right who, how much and how often, one big "Bill now" and a few tiles.
  if (simple) {
    const phone = primaryPhone(schedule.customer).value || null;
    const nextDay = formatDate(schedule.nextRunAt);
    const after = formatDate(advanceRunDate(schedule.nextRunAt, frequency, schedule.anchorDay));
    const whatHappens = [
      "A draft invoice for this period is made now",
      schedule.autoSend ? ", emailed to them" : "",
      schedule.autoCharge ? ", and charged to their card" : "",
      `. The next one after it is due on ${after}.`,
    ].join("");
    const totalRows: BillTotalRow[] = [
      { label: "Subtotal", value: formatCents(totals.subtotalCents) },
      {
        label: schedule.taxRateBps > 0 ? taxLabel(schedule.taxRate?.name, schedule.taxRateBps) : "No tax",
        value: formatCents(totals.taxCents),
      },
      { label: "Each bill", value: formatCents(totals.totalCents), size: "large", divider: true },
    ];

    const tiles = [
      <Link key="edit" href={`/invoices/recurring/${schedule.id}/edit`} data-touch-control className={TILE_CLASS}>
        <ACTIONS.edit aria-hidden />
        Change
      </Link>,
      <ScheduleActiveButton
        key="pause"
        scheduleId={schedule.id}
        active={schedule.active}
        scheduleName={schedule.name}
        tileClassName={TILE_CLASS}
      />,
      <Link key="list" href="/invoices/recurring" data-touch-control className={TILE_CLASS}>
        <ICONS.recurring aria-hidden />
        All repeat bills
      </Link>,
    ];

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {schedule.lastChargeError ? (
          <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-destructive-soft px-4 py-3 text-base font-medium leading-relaxed text-destructive">
            <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0" />
            <span>
              The last card charge did not go through: {schedule.lastChargeError} The
              invoice was still made. This message goes once a charge works.
            </span>
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <BillSummary
            className="lg:col-start-2 lg:row-start-1"
            title={schedule.name}
            status={<StatusPill tone={state.tone} label={state.label} />}
            customer={{ name, href: `/customers/${schedule.customer.id}`, phone }}
            hero={
              <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface-hover p-4">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rf-num text-[40px] font-bold leading-none tracking-tight text-foreground">
                    {formatCents(totals.totalCents)}
                  </span>
                  <span className="text-lg font-semibold text-muted-foreground">{FREQUENCY_CADENCE[frequency]}</span>
                </p>
                <p className={cn("text-base font-semibold leading-snug", due ? "text-status-overdue-fg" : "text-foreground")}>
                  {!schedule.active ? "Paused: no bills are being made" : due ? `Next bill was due ${nextDay}` : `Next bill ${nextDay}`}
                </p>
                <p className="text-[15px] text-muted-foreground">
                  {terms}
                  {automation.length > 0 ? ` · ${automation.join(" and ").toLowerCase()}` : " · you send each one"}
                </p>
              </div>
            }
            primary={
              schedule.lines.length > 0 ? (
                <div className={BIG_BUTTON_SLOT}>
                  <RunNowButton scheduleId={schedule.id} label="Bill now" confirm={whatHappens} className="h-14 w-full text-lg" />
                </div>
              ) : null
            }
            tiles={tiles}
            tileCount={tiles.length}
            hint={`${invoicesSoFarWords(generatedCount)}. A draft is made on its day without you; Bill now makes this one early.`}
          />

          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            <Section title="What goes on each bill">
              {schedule.lines.length === 0 ? (
                <EmptyLines
                  title="Nothing on it yet"
                  hint="Add what to bill each time. No bills are made until there is something on it."
                  action={
                    <Button asChild className="h-12 px-6 text-base">
                      <Link href={`/invoices/recurring/${schedule.id}/edit`}>
                        <ACTIONS.add /> Add items
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <LineList lines={schedule.lines} />
              )}
            </Section>
            {schedule.lines.length > 0 ? <TotalsBlock rows={totalRows} /> : null}

            <Section title="Bills made so far">
              {schedule.invoices.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-strong px-5 py-6 text-base text-muted-foreground">
                  None yet. The first one is made on {nextDay}.
                </p>
              ) : (
                <DocumentGrid>
                  {schedule.invoices.map((invoice) => {
                    const invTotals = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
                    return (
                      <li key={invoice.id}>
                        <InvoiceCard
                          now={wallNow}
                          invoice={{
                            id: invoice.id,
                            number: invoice.number,
                            customerName: name,
                            status: invoice.status,
                            createdAt: shopWall(invoice.createdAt, zone) ?? invoice.createdAt,
                            dueDate: invoice.dueDate,
                            paidAt: shopWall(invoice.paidAt, zone),
                            totalCents: invTotals.totalCents,
                            balanceCents: invTotals.balanceCents,
                          }}
                        />
                      </li>
                    );
                  })}
                </DocumentGrid>
              )}
            </Section>

            {role === "OWNER" ? (
              <Section title="Remove it">
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
                  <p className="text-base leading-snug text-muted-foreground">
                    {canDelete
                      ? "Deleting removes this repeat bill for good. No invoice is touched."
                      : `It has made ${invoicesSoFarWords(generatedCount).toLowerCase()}, so it can't be deleted: pause it instead and the history stays.`}
                  </p>
                  {canDelete ? (
                    <div className="w-fit [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:px-5 [&_[data-slot=button]]:text-base">
                      <ConfirmActionDialog
                        action={deleteScheduleAction}
                        fields={{ id: schedule.id }}
                        triggerLabel="Delete repeat bill"
                        triggerIcon={<ACTIONS.delete />}
                        title={`Delete ${schedule.name}?`}
                        description="The repeat bill and its items go for good. This can't be undone."
                        confirmLabel="Delete repeat bill"
                      />
                    </div>
                  ) : null}
                </div>
              </Section>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        The object-page header every other money screen opens with. This was the
        last one still on breadcrumbs over a hero card: a 30px name, the
        customer restated under it, and a row of nine chips carrying facts that
        are columns everywhere else in the app.

        The headline figure is the PER-RUN TOTAL — what this contract bills each
        time it fires. It is the number someone opens a schedule to check, and
        the only one the schedule itself owns; everything the runs have actually
        raised lives in the generated-invoices table below.
      */}
      <ObjectHeader
        back={{ label: "Repeat bills", href: "/invoices/recurring" }}
        value={formatCents(totals.totalCents)}
        title={schedule.name}
        subtitle={`Each bill — bills ${FREQUENCY_CADENCE[frequency]}`}
        status={<StatusPill tone={state.tone} label={state.label} />}
        meta={[
          {
            label: "Customer",
            value: (
              <Link
                href={`/customers/${schedule.customer.id}`}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                {name}
              </Link>
            ),
          },
          { label: "Frequency", value: frequencyLabel(frequency) },
          {
            label: due ? "Due" : "Next run",
            value: (
              <span className={cn(due && "font-semibold text-status-overdue-fg")}>
                {formatDate(schedule.nextRunAt)}
              </span>
            ),
          },
          { label: "Terms", value: terms },
          {
            label: "Made so far",
            value: (
              <span className="rf-num">
                {generatedCount} invoice{generatedCount === 1 ? "" : "s"}
              </span>
            ),
          },
          {
            label: "Automation",
            value: automation.length > 0 ? automation.join(" · ") : "You send each one",
          },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices/recurring/${schedule.id}/edit`}>
                <ACTIONS.edit /> Edit
              </Link>
            </Button>
            <ScheduleActiveButton
              size="sm"
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
                triggerSize="sm"
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
            {/* Primary last, the way the invoice and PO headers order theirs. */}
            <RunNowButton size="sm" scheduleId={schedule.id} label="Bill now" />
          </>
        }
      />

      {/* The full reason, not the list page's tooltip. This is where someone
          lands when they want to know what to do about it. Its own block under
          the header rather than a fourth thing inside it — the header carries
          what the schedule IS, not what went wrong last night. */}
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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* --------------------------------------------------------- lines */}
        <Card>
          <CardHeader icon={ICONS.checklist} title="What goes on each bill" />
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
          <CardHeader icon={ICONS.cash} title="Each bill" />
          <CardContent className="flex flex-col gap-3">
            <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
            <TotalRow
              label={schedule.taxRateBps > 0 ? `Tax (${formatBps(schedule.taxRateBps)})` : "No tax"}
              value={formatCents(totals.taxCents)}
            />
            <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Total
              </span>
              <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                {formatCents(totals.totalCents)}
              </span>
            </div>
            <p className="border-t border-border pt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Bills {FREQUENCY_CADENCE[frequency]}. After the{" "}
              {formatDate(schedule.nextRunAt)} bill the next one is due on{" "}
              <span className="font-semibold text-foreground">
                {formatDate(advanceRunDate(schedule.nextRunAt, frequency, schedule.anchorDay))}
              </span>
              . A draft is made on its day without you.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------- generated list */}
      <Card>
        <CardHeader icon={ICONS.invoice} title="Bills made so far" />
        <CardContent className="px-0 py-0">
          {schedule.invoices.length === 0 ? (
            <EmptyState
              icon={ICONS.invoice}
              title="Nothing raised yet"
              hint={`The first draft appears here on ${formatDate(schedule.nextRunAt)} — or press "Bill now" to bill this period early.`}
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
                          {formatDate(invoice.createdAt, zone)}
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

/** "3 invoices so far" in a sentence: "No invoices yet", "1 invoice", "3 invoices". */
function invoicesSoFarWords(count: number): string {
  if (count === 0) return "No invoices yet";
  return `${count} invoice${count === 1 ? "" : "s"} so far`;
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
