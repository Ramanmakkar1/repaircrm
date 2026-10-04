"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { loadAuditPageAction } from "@/app/(app)/settings/audit-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InitialsVisual } from "@/components/ui/record-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITIES,
  isNotableAction,
  type AuditPage,
  type AuditRow,
} from "./audit-types";
import { groupByShopDay, shopTime } from "./shop-time";
import { useRenderedAt, useShopZone } from "./shop-zone";
import type { TeamMember } from "./types";

/**
 * Settings → Activity history (the `audit` panel). Owner only.
 *
 * A list, not a table: each entry is one sentence a shop owner can read without
 * a legend — who, what, when — under a heading for its day (Today, Yesterday,
 * Friday, October 2) on the shop's own calendar, with the raw detail folded
 * away behind the row. Two pickers (What / Who) instead of two rows of pills.
 * Fifty at a time, newest first.
 */
const MoreIcon = ACTIONS.more;
const FilterIcon = ACTIONS.filter;

export function AuditTab({
  initial,
  members,
}: {
  initial: AuditPage;
  members: TeamMember[];
}) {
  const [rows, setRows] = React.useState<AuditRow[]>(initial.rows);
  const [cursor, setCursor] = React.useState<string | null>(initial.nextCursor);
  const [entity, setEntity] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Every filter change is a fresh first page from the server; paging through
  // a filtered list client-side would only ever show what was already loaded.
  async function applyFilters(nextEntity: string, nextUserId: string) {
    setEntity(nextEntity);
    setUserId(nextUserId);
    setBusy(true);
    const result = await loadAuditPageAction({
      entity: nextEntity,
      userId: nextUserId,
    });
    setBusy(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setRows(result.rows);
    setCursor(result.nextCursor);
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy(true);
    const result = await loadAuditPageAction({ entity, userId, cursor });
    setBusy(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setRows((current) => [...current, ...result.rows]);
    setCursor(result.nextCursor);
  }

  const filtered = entity !== "" || userId !== "";
  const zone = useShopZone();
  const now = useRenderedAt();
  const days = groupByShopDay(rows, now, zone);
  const ALL = "all";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-muted-foreground">What</span>
          <Select value={entity || ALL} onValueChange={(next) => applyFilters(next === ALL ? "" : next, userId)} disabled={busy}>
            <SelectTrigger className="h-12 text-base" aria-label="Show what">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everything</SelectItem>
              {AUDIT_ENTITIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {members.length > 1 ? (
          <label className="flex min-w-48 flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-muted-foreground">Who</span>
            <Select value={userId || ALL} onValueChange={(next) => applyFilters(entity, next === ALL ? "" : next)} disabled={busy}>
              <SelectTrigger className="h-12 text-base" aria-label="Show who">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        {filtered ? (
          <Button variant="ghost" className="h-12" onClick={() => applyFilters("", "")} disabled={busy}>
            <FilterIcon aria-hidden /> Show everything
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.audit}
            title={filtered ? "Nothing matches" : "Nothing recorded yet"}
            hint={
              filtered
                ? "Try showing everything, or everyone."
                : "Sign-ins, password changes, deleted repairs and voided invoices will appear here as they happen."
            }
          />
        </Card>
      ) : (
        days.map((day) => (
          <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-2">
            <h3 id={`day-${day.key}`} className="text-[17px] font-semibold text-foreground">
              {day.heading}
            </h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {day.rows.map((row) => (
                <AuditEntry key={row.id} row={row} zone={zone} />
              ))}
            </ul>
          </section>
        ))
      )}

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" className="h-12 px-5" onClick={loadMore} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <MoreIcon aria-hidden />}
            {busy ? "Loading…" : "Show older"}
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <p className="text-center text-[14px] text-muted-foreground">
          That&apos;s everything.
        </p>
      ) : null}
    </div>
  );
}

function AuditEntry({ row, zone }: { row: AuditRow; zone: string }) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = Boolean(row.meta || row.ip || row.entityId);
  const who = row.actorName ?? "Repairs helper";

  return (
    <li className="flex gap-3.5 px-4 py-3.5">
      <InitialsVisual name={who} className="size-10 text-[15px] sm:size-10 sm:text-[15px]" />
      <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[15px] font-semibold text-foreground">
          {who}
        </span>
        {/*
          No dot: a feed of fifty of these reads as one column of bullets
          otherwise, and the word already carries the whole meaning.
        */}
        <StatusPill
          size="sm"
          dot={false}
          tone={isNotableAction(row.action) ? "danger" : "neutral"}
          label={AUDIT_ACTION_LABEL[row.action] ?? row.action}
        />
        <span className="ml-auto text-[14px] tabular-nums text-muted-foreground">
          {shopTime(row.createdAt, zone)}
        </span>
      </div>

      <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
        {row.summary}
      </p>

      {hasDetail ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-sm text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
            {open ? "Hide details" : "Details"}
          </button>

          {open ? (
            <div className="mt-2 flex flex-col gap-1.5 rounded-md bg-surface-hover px-3.5 py-3 text-[14px] text-muted-foreground">
              {row.ip ? (
                <p>
                  <span className="font-semibold text-foreground">From </span>
                  <span className="font-mono">{row.ip}</span>
                </p>
              ) : null}
              {row.entityId ? (
                <p className="break-all">
                  <span className="font-semibold text-foreground">Record </span>
                  <span className="font-mono">{row.entityId}</span>
                </p>
              ) : null}
              {row.meta ? (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[14px] leading-relaxed">
                  {row.meta}
                </pre>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      </div>
    </li>
  );
}
