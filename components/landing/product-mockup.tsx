/**
 * The hero "money shot": a faux-browser frame containing a miniature of the
 * real ticket board.
 *
 * Everything here is hand-built markup — divs, borders and the same design
 * tokens the app itself renders with (`bg-status-*`, `border-border`,
 * `shadow-*`). There is no screenshot and no <img>, so the mockup stays crisp
 * at any density, weighs nothing, and can never drift out of date the way an
 * exported PNG does.
 *
 * The whole thing is decorative: the page states its claims in real prose, so
 * the frame is hidden from assistive technology rather than read out as a wall
 * of orphaned ticket numbers.
 */

import { WrenchIcon } from "./icons";

type Status = "new" | "in-progress" | "waiting" | "ready";

const DOT: Record<Status, string> = {
  new: "bg-status-new",
  "in-progress": "bg-status-in-progress",
  waiting: "bg-status-waiting",
  ready: "bg-status-ready",
};

const CHIP: Record<Status, string> = {
  new: "bg-status-new-bg text-status-new-fg",
  "in-progress": "bg-status-in-progress-bg text-status-in-progress-fg",
  waiting: "bg-status-waiting-bg text-status-waiting-fg",
  ready: "bg-status-ready-bg text-status-ready-fg",
};

function ColumnHead({
  status,
  label,
  count,
}: {
  status: Status;
  label: string;
  count: number;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2 px-0.5">
      <span className={`size-2 shrink-0 rounded-full ${DOT[status]}`} />
      <span className="truncate text-[11.5px] font-semibold tracking-tight text-foreground">
        {label}
      </span>
      <span className="rf-nums ml-auto text-[11px] font-semibold text-faint-foreground">
        {count}
      </span>
    </div>
  );
}

function TicketCard({
  id,
  device,
  customer,
  chip,
  chipStatus,
  stale,
}: {
  id: string;
  device: string;
  customer: string;
  chip: string;
  chipStatus: Status;
  stale?: string;
}) {
  return (
    <div
      className={[
        "rounded-md border bg-surface p-2.5 shadow-xs",
        stale
          ? "border-status-overdue-bg border-l-[3px] border-l-status-overdue"
          : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rf-nums text-[10.5px] font-bold text-faint-foreground">
          {id}
        </span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${CHIP[chipStatus]}`}
        >
          {chip}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] font-semibold leading-snug tracking-tight text-foreground">
        {device}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {customer}
      </p>

      {stale ? (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-status-overdue-fg">
          <span className="size-1.5 shrink-0 rounded-full bg-status-overdue" />
          {stale}
        </p>
      ) : null}
    </div>
  );
}

export function ProductMockup() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      {/* browser chrome */}
      <div className="flex h-10 items-center gap-4 border-b border-border bg-surface-hover px-4">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="mx-auto hidden max-w-[260px] flex-1 truncate rounded-full border border-border bg-surface px-3 py-1 text-center text-[10.5px] font-medium text-faint-foreground sm:block">
          app.repairflow.com/tickets
        </div>
        <span className="hidden w-[54px] shrink-0 sm:block" />
      </div>

      {/* app body */}
      <div className="flex">
        {/* left rail */}
        <div className="hidden w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-border py-3 sm:flex">
          <span className="mb-1.5 flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-xs">
            <WrenchIcon className="size-4" />
          </span>
          <span className="h-8 w-8 rounded-md bg-accent-soft" />
          <span className="h-8 w-8 rounded-md bg-surface-hover" />
          <span className="h-8 w-8 rounded-md bg-surface-hover" />
          <span className="h-8 w-8 rounded-md bg-surface-hover" />
          <span className="h-8 w-8 rounded-md bg-surface-hover" />
        </div>

        {/* main */}
        <div className="min-w-0 flex-1 p-3.5 sm:p-5">
          {/* page header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold tracking-tight text-foreground">
                Tickets
              </p>
              <p className="rf-nums text-[11px] text-muted-foreground">
                18 open · 3 need attention
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden h-7 w-28 rounded-md border border-border bg-surface-hover md:block" />
              <span className="flex h-7 items-center rounded-md bg-accent px-2.5 text-[11px] font-semibold text-accent-foreground shadow-xs">
                New ticket
              </span>
            </div>
          </div>

          {/* board */}
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <div>
              <ColumnHead status="new" label="New" count={4} />
              <div className="flex flex-col gap-2">
                <TicketCard
                  id="#1042"
                  device="iPhone 13 — cracked screen"
                  customer="Dana Whitfield"
                  chip="Walk-in"
                  chipStatus="new"
                />
                <TicketCard
                  id="#1041"
                  device="Dell XPS 15 — won't boot"
                  customer="Northgate Dental"
                  chip="Mail-in"
                  chipStatus="new"
                />
              </div>
            </div>

            <div>
              <ColumnHead status="in-progress" label="In progress" count={6} />
              <div className="flex flex-col gap-2">
                <TicketCard
                  id="#1038"
                  device="MacBook Air — liquid damage"
                  customer="Priya Raman"
                  chip="Bench 2"
                  chipStatus="in-progress"
                />
                <TicketCard
                  id="#1035"
                  device="PS5 — HDMI port"
                  customer="Owen Marsh"
                  chip="Diagnosed"
                  chipStatus="in-progress"
                />
              </div>
            </div>

            <div>
              <ColumnHead status="waiting" label="Waiting" count={5} />
              <div className="flex flex-col gap-2">
                <TicketCard
                  id="#1029"
                  device="Galaxy S22 — battery"
                  customer="Lena Fontaine"
                  chip="On parts"
                  chipStatus="waiting"
                  stale="No update in 4 days"
                />
                <TicketCard
                  id="#1027"
                  device="Surface Pro — hinge"
                  customer="Bellwood Clinic"
                  chip="Approval"
                  chipStatus="waiting"
                />
              </div>
            </div>

            <div>
              <ColumnHead status="ready" label="Ready" count={3} />
              <div className="flex flex-col gap-2">
                <TicketCard
                  id="#1021"
                  device="ThinkPad T14 — SSD swap"
                  customer="Marcus Ojo"
                  chip="Paid"
                  chipStatus="ready"
                />
                <TicketCard
                  id="#1018"
                  device="iPad 9 — charge port"
                  customer="Rosa Delgado"
                  chip="Notified"
                  chipStatus="ready"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
