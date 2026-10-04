import * as React from "react";
import Link from "next/link";
import { Clock } from "lucide-react";

import { DeviceVisual } from "@/components/dashboard/device-visual";
import { deviceName, repairChips } from "@/components/tickets/repair-card-facts";
import { Button } from "@/components/ui/button";
import { STATUS_TONE, StatusPill, normalizeStatus } from "@/components/ui/badge";
import { ICONS } from "@/components/ui/icons";
import { MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { formatInZone } from "@/lib/shop-time";
import { repairRowLines } from "./customer-screen";

export type CustomerRepairRow = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  createdAt: Date;
  asset: { type: string; make: string | null; model: string | null } | null;
};

/**
 * One repair on the customer's own screen, built like the Repairs list card
 * (device picture, a title, one quiet line, the status in words and the facts
 * as chips) but named for the job, because the customer is the page.
 */
function RepairRow({
  repair,
  now,
  closed,
  timeZone,
}: {
  repair: CustomerRepairRow;
  now: number;
  closed: boolean;
  timeZone?: string | null;
}) {
  const lines = repairRowLines(repair);
  const device = deviceName(repair.asset);
  const chips = repairChips({ status: repair.status, priority: repair.priority, dueDate: repair.dueDate }, now, timeZone);

  return (
    <RecordCard
      href={`/tickets/${repair.id}`}
      className="h-full"
      visual={<DeviceVisual label={device ?? repair.subject} type={repair.asset?.type ?? ""} />}
      // Two lines, not one: the job is what staff read first, and "cracked scre..." says nothing.
      title={<span className="line-clamp-2 whitespace-normal break-words">{lines.title}</span>}
      subtitle={lines.subtitle ?? undefined}
      meta={
        <>
          <StatusPill tone={STATUS_TONE[normalizeStatus(repair.status)]} label={repair.status} className="py-1 text-[13px]" />
          {chips.due ? (
            <MetaChip icon={Clock} tone={chips.due.alert ? "alert" : "neutral"}>
              {chips.due.label}
            </MetaChip>
          ) : null}
          {chips.shown.map((fact) => (
            <MetaChip key={fact.kind} tone={fact.alert ? "alert" : "neutral"}>
              {fact.label}
            </MetaChip>
          ))}
          {closed || !chips.due ? <MetaChip>Opened {formatInZone(repair.createdAt, "MMM d", timeZone)}</MetaChip> : null}
        </>
      }
    />
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        {typeof count === "number" ? (
          <span className="rf-num min-w-6 rounded-full bg-surface-hover px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

/**
 * The Repairs section: what is on the bench now first, then the history, and
 * one big button for the rest. A customer with no repairs gets a plain next
 * step instead of an empty box.
 */
export function CustomerRepairs({
  customerId,
  firstName,
  open,
  earlier,
  total,
  now,
  timeZone,
}: {
  customerId: string;
  /** For the empty state: "Start the first repair for Elena". */
  firstName: string;
  open: CustomerRepairRow[];
  earlier: CustomerRepairRow[];
  /** Every repair they have ever had, so we know when to offer "See all". */
  total: number;
  now: number;
  /** The shop's time zone (Shop.timezone): "Opened Oct 4" and "Due Oct 4" are the shop's days. */
  timeZone?: string | null;
}) {
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
        <ICONS.ticket className="size-10 text-faint-foreground" strokeWidth={1.4} aria-hidden />
        <div className="flex max-w-sm flex-col gap-1">
          <p className="text-lg font-semibold">No repairs yet</p>
          <p className="text-base text-muted-foreground">
            {firstName ? `Start the first repair for ${firstName}.` : "Start the first repair for this customer."}
          </p>
        </div>
        <Button size="lg" className="h-14 px-8 text-base" asChild>
          <Link href={`/tickets/new?customerId=${customerId}`}>
            <ICONS.ticket className="size-5" aria-hidden />
            New repair
          </Link>
        </Button>
      </div>
    );
  }

  const shown = open.length + earlier.length;

  return (
    <div className="flex flex-col gap-6">
      {open.length > 0 ? (
        <Group title="Open now" count={open.length}>
          <RecordGrid className="2xl:grid-cols-2">
            {open.map((repair) => (
              <li key={repair.id}>
                <RepairRow repair={repair} now={now} closed={false} timeZone={timeZone} />
              </li>
            ))}
          </RecordGrid>
        </Group>
      ) : (
        <p className="text-base text-muted-foreground">Nothing on the bench right now.</p>
      )}

      {earlier.length > 0 ? (
        <Group title="Earlier">
          <RecordGrid className="2xl:grid-cols-2">
            {earlier.map((repair) => (
              <li key={repair.id}>
                <RepairRow repair={repair} now={now} closed timeZone={timeZone} />
              </li>
            ))}
          </RecordGrid>
        </Group>
      ) : null}

      {total > shown ? (
        <Button variant="outline" size="lg" className="h-14 w-full text-base sm:w-auto sm:self-start" asChild>
          <Link href={`/tickets?customerId=${customerId}&status=all`}>See all {total} repairs</Link>
        </Button>
      ) : null}
    </div>
  );
}
