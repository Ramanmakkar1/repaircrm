import * as React from "react";
import { Clock, MessageCircle, Package } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { MetaChip, RecordCard } from "@/components/ui/record-card";
import { STATUS_TONE, StatusPill, normalizeStatus } from "@/components/ui/badge";
import { DeviceVisual } from "@/components/dashboard/device-visual";
import { initials } from "@/components/customers/format";
import type { ChecklistProgress } from "@/lib/checklist";
import { customerLabel } from "./ticket-meta";
import {
  deviceName,
  pickIntakePhotoId,
  repairChips,
  repairSubtitle,
  type RepairFactKind,
} from "./repair-card-facts";

/**
 * One repair as one big tappable card: the same card on the Repairs list and on
 * the dashboard, so a job looks the same wherever you meet it.
 *
 *   [ device ]  #1008 · Owen Fitzgerald                      (MW)
 *               ThinkPad T14 - pop-ups and browser redirects
 *               ● In Progress  Overdue 2d  High priority  Parts: 1 ordered
 *
 * The status sits with the facts rather than at the top right: a status such as
 * "Waiting on Customer" is wider than the name it would squeeze off the line on
 * a phone. The word is always shown (colour only backs it up), and there is no
 * coloured stripe down the edge.
 */
export type RepairCardData = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority?: string | null;
  dueDate?: Date | null;
  customer: { firstName: string; lastName: string; businessName?: string | null };
  assignedTo?: { name: string } | null;
  asset?: { type: string; make?: string | null; model?: string | null } | null;
  /** Image attachments, oldest first; the intake photo is picked from these. */
  attachments?: { id: string; fileName: string }[];
  /** Only the part orders still outstanding. */
  partOrders?: { status: string }[];
  checklist?: ChecklistProgress | null;
  depositCents?: number | null;
  needsReply?: boolean;
};

const FACT_ICON: Partial<Record<RepairFactKind, typeof Package>> = {
  parts: Package,
  reply: MessageCircle,
};

export function RepairCard({
  repair,
  now,
  className,
}: {
  repair: RepairCardData;
  /** One request-time clock, so every card in a render agrees on "now". */
  now: number;
  className?: string;
}) {
  const device = deviceName(repair.asset);
  const chips = repairChips(repair, now);
  const tech = repair.assignedTo?.name ?? null;
  const customer = customerLabel(repair.customer);

  return (
    <RecordCard
      href={`/tickets/${repair.id}`}
      className={className}
      visual={<DeviceVisual label={device ?? repair.subject} type={repair.asset?.type ?? ""} photoId={pickIntakePhotoId(repair.attachments)} />}
      title={`#${repair.number} · ${customer}`}
      subtitle={repairSubtitle(repair.subject, device)}
      meta={
        <>
          <StatusPill tone={STATUS_TONE[normalizeStatus(repair.status)]} label={repair.status} className="py-1 text-[13px]" />
          {chips.due ? (
            <MetaChip icon={Clock} tone={chips.due.alert ? "alert" : "neutral"}>
              {chips.due.label}
            </MetaChip>
          ) : null}
          {chips.shown.map((fact) => (
            <MetaChip key={fact.kind} icon={FACT_ICON[fact.kind]} tone={fact.alert ? "alert" : "neutral"}>
              {fact.label}
            </MetaChip>
          ))}
          {chips.more ? (
            <span title={chips.more.detail}>
              <MetaChip>{chips.more.label}</MetaChip>
            </span>
          ) : null}
          <TechMark tech={tech} className="ml-auto size-7 text-xs sm:hidden" />
        </>
      }
      // On a phone the line is too narrow to give a corner to the initials, so
      // they ride at the end of the facts instead.
      trailing={
        <span className="hidden h-full items-center sm:flex">
          <TechMark tech={tech} className="size-9 text-[13px]" />
        </span>
      }
    />
  );
}

/** The assigned person as small initials in a soft circle; a dashed "?" when nobody has it. */
function TechMark({ tech, className }: { tech: string | null; className?: string }) {
  return tech ? (
    <span title={tech} className={cn("flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-soft-foreground", className)}>
      <span aria-hidden>{initials(tech)}</span>
      <span className="sr-only">Assigned to {tech}</span>
    </span>
  ) : (
    <span title="Unassigned" className={cn("flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong font-semibold text-muted-foreground", className)}>
      <span aria-hidden>?</span>
      <span className="sr-only">Unassigned</span>
    </span>
  );
}
