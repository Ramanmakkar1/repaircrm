import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/components/billing/format";
import { customerLabel } from "@/components/billing/queries";
import {
  SCHEDULE_STATE_META,
  frequencyLabel,
  isDue,
  scheduleState,
} from "@/components/recurring/meta";
import {
  GenerateDueButton,
  ScheduleActiveSwitch,
} from "@/components/recurring/schedule-controls";

export const metadata = { title: "Recurring billing · RepairFlow" };

export default async function RecurringSchedulesPage() {
  const { shopId } = await requireUser();

  const schedules = await db.recurringInvoice.findMany({
    where: { shopId },
    // Live schedules first, then whichever is due soonest.
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, businessName: true },
      },
      lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      _count: { select: { invoices: true } },
    },
  });

  const now = requestNow();
  const dueCount = schedules.filter((s) => isDue(s.nextRunAt, s.active, now)).length;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/invoices"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All invoices
      </Link>

      <PageHeader
        icon={ICONS.recurring}
        title="Recurring billing"
        description="Contracts and retainers that stamp out a draft invoice on a cadence."
        actions={
          <>
            {dueCount > 0 ? <GenerateDueButton dueCount={dueCount} /> : null}
            <Button variant={dueCount > 0 ? "outline" : "default"} asChild>
              <Link href="/invoices/recurring/new">
                <ACTIONS.add /> New schedule
              </Link>
            </Button>
          </>
        }
      />

      {schedules.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.recurring}
            title="No recurring schedules yet"
            hint="Set one up for a managed-service retainer or a monthly support contract, and RepairFlow will draft the invoice for you."
            action={
              <Button asChild>
                <Link href="/invoices/recurring/new">
                  <ACTIONS.add /> New schedule
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {schedules.map((schedule) => {
            const totals = calcTotals(schedule.lines, schedule.taxRateBps);
            const due = isDue(schedule.nextRunAt, schedule.active, now);
            const state = SCHEDULE_STATE_META[scheduleState(schedule.active, due)];
            const name = customerLabel(schedule.customer);

            return (
              // Amber for a run that has come due, red for a charge that
              // bounced — a paused schedule is simply quiet, not a problem.
              <Card
                key={schedule.id}
                tone={
                  schedule.lastChargeError
                    ? "danger"
                    : due
                      ? "active"
                      : undefined
                }
                className={cn(
                  "flex flex-col gap-4 p-5",
                  !schedule.active && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/invoices/recurring/${schedule.id}`}
                    className="min-w-0 rounded-sm text-lg font-bold leading-snug tracking-tight text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {schedule.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <StatusPill size="sm" tone={state.tone} label={state.label} />
                    <ScheduleActiveSwitch
                      scheduleId={schedule.id}
                      active={schedule.active}
                      scheduleName={schedule.name}
                    />
                  </span>
                </div>

                <Link
                  href={`/customers/${schedule.customer.id}`}
                  className="flex w-fit min-w-0 items-center gap-1.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-accent"
                >
                  <ICONS.customer className="size-4 shrink-0" />
                  <span className="truncate">{name}</span>
                </Link>

                <div className="flex items-end justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Each run
                    </span>
                    <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {due ? "Due" : schedule.active ? "Next run" : "Paused at"}
                    </span>
                    <span
                      className={cn(
                        "text-[15px] font-bold leading-none tabular-nums",
                        due ? "text-status-overdue-fg" : "text-foreground",
                      )}
                    >
                      {formatDate(schedule.nextRunAt)}
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Chip icon={ICONS.recurring}>{frequencyLabel(schedule.frequency)}</Chip>
                  <Chip icon={ICONS.invoice}>
                    {schedule._count.invoices} generated
                  </Chip>
                  {schedule.lastRunAt ? (
                    <Chip>Last {formatDate(schedule.lastRunAt)}</Chip>
                  ) : null}
                  {schedule.autoSend ? (
                    <Chip icon={ICONS.email}>Auto-send</Chip>
                  ) : null}
                  {schedule.autoCharge ? (
                    <Chip
                      icon={ICONS.payment}
                      className="bg-chip-accent-bg text-chip-accent-fg"
                    >
                      Auto-charge
                    </Chip>
                  ) : null}
                  {/* Cleared automatically on the next successful charge, so
                      this pill only ever describes the situation right now. */}
                  {schedule.lastChargeError ? (
                    <StatusPill
                      size="sm"
                      tone="danger"
                      label="Last charge failed"
                      title={schedule.lastChargeError}
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
