"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { loadAuditPageAction } from "@/app/(app)/settings/audit-actions";
import { formatDateTime } from "@/components/billing/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import type { TeamMember } from "./types";

/**
 * Settings → Audit log. Owner only.
 *
 * A list, not a table: each entry is one sentence a shop owner can read without
 * a legend — who, what, when — with the raw detail folded away behind the row
 * for the rare occasion someone needs it. Fifty at a time, newest first.
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

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-hover text-muted-foreground"
            >
              <ICONS.audit className="size-4" />
            </span>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Activity
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            <FilterRow label="Show">
              <Pill
                active={entity === ""}
                onClick={() => applyFilters("", userId)}
              >
                Everything
              </Pill>
              {AUDIT_ENTITIES.map((option) => (
                <Pill
                  key={option.value}
                  active={entity === option.value}
                  onClick={() => applyFilters(option.value, userId)}
                >
                  {option.label}
                </Pill>
              ))}
            </FilterRow>

            {members.length > 1 ? (
              <FilterRow label="By">
                <Pill
                  active={userId === ""}
                  onClick={() => applyFilters(entity, "")}
                >
                  Everyone
                </Pill>
                {members.map((member) => (
                  <Pill
                    key={member.id}
                    active={userId === member.id}
                    onClick={() => applyFilters(entity, member.id)}
                  >
                    {member.name}
                  </Pill>
                ))}
              </FilterRow>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="px-0 py-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={ICONS.audit}
              title={filtered ? "Nothing matches those filters" : "Nothing recorded yet"}
              hint={
                filtered
                  ? "Try a wider filter — the log only keeps what has actually happened."
                  : "Sign-ins, password changes, deleted tickets and voided invoices will appear here as they happen."
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={() => applyFilters("", "")}>
                    <FilterIcon aria-hidden /> Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <AuditEntry key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <MoreIcon aria-hidden />}
            {busy ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <p className="text-center text-[13.5px] text-muted-foreground">
          That&apos;s the whole trail.
        </p>
      ) : null}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-accent text-accent-foreground shadow-xs"
          : "bg-surface-hover text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AuditEntry({ row }: { row: AuditRow }) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = Boolean(row.meta || row.ip || row.entityId);

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[14.5px] font-semibold text-foreground">
          {row.actorName ?? "System"}
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
        <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      </div>

      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
        {row.summary}
      </p>

      {hasDetail ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
            {open ? "Hide details" : "Details"}
          </button>

          {open ? (
            <div className="mt-2 flex flex-col gap-1.5 rounded-md bg-surface-hover px-3.5 py-3 text-[13px] text-muted-foreground">
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
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed">
                  {row.meta}
                </pre>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
