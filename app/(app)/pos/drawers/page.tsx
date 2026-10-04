import Link from "next/link";
import { Banknote } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { safeTimeZone } from "@/lib/dashboard/logic";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { IconVisual, MetaChip } from "@/components/ui/record-card";
import { cn } from "@/components/ui/cn";
import { DRAWER_VERDICT_META } from "@/components/pos/drawer-types";
import {
  DRAWER_VIEWS,
  asDrawerView,
  drawerCardWords,
  drawerOffSentence,
  drawerViewCounts,
  shopClockLabel,
} from "@/components/pos/drawer-history";
import { getDrawerSummaryAction } from "./actions";

export const metadata = { title: "Cash drawers · Repairs helper" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

/**
 * Cash drawers: the shop's over/short record, in the register's look.
 *
 * OWNER only, and guarded by `requireRole` rather than a hidden link: a
 * technician who types the URL gets bounced, because a pattern of short
 * drawers is a management conversation, not shop-floor reading.
 *
 * Today's drawer first (open since when, what it should hold, and the one big
 * button to count and close it at the register), then how often the till is
 * off, then every drawer as a card that leads with the word and the amount
 * ("Short $1.34"), with its end-of-day report one tap away. Every time is the
 * shop's own clock (`Shop.timezone`), never the server's.
 */
export default async function DrawersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { shopId } = await requireRole("OWNER");
  const [{ view: rawView }, shop] = await Promise.all([
    searchParams,
    db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } }),
  ]);
  const zone = safeTimeZone(shop?.timezone);
  const view = asDrawerView(rawView);

  const sessions = await db.cashDrawerSession.findMany({
    where: { shopId },
    orderBy: { openedAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      openingCents: true,
      expectedCents: true,
      countedCents: true,
      note: true,
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    },
  });

  // The drawer that is open right now, and what it should hold (the same sum
  // the close dialog shows: float + cash in − cash refunds).
  const openSession = sessions.find((session) => session.closedAt === null) ?? null;
  const openSummary = openSession ? await getDrawerSummaryAction(openSession.id) : null;

  const counts = drawerViewCounts(sessions, zone);
  const shown = view
    ? sessions.filter((session) => drawerCardWords(session, zone).verdict === view)
    : sessions;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Cash drawers"
        description="Every open and close: what should have been in the till, and what was counted."
      />

      {/* ------------------------------------------------- today's drawer -- */}
      <section
        aria-label="Today's drawer"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
      >
        <IconVisual icon={Banknote} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[15px] font-semibold text-muted-foreground">Today&rsquo;s drawer</p>
          {openSession ? (
            <>
              <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
                Open since {shopClockLabel(openSession.openedAt, zone)}
              </p>
              <p className="text-base text-muted-foreground">
                {openSummary?.ok
                  ? `${formatCents(openSummary.summary.expectedCents)} should be in it now · opened by ${openSession.openedBy.name}`
                  : `Opened by ${openSession.openedBy.name}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground">Not open</p>
              <p className="text-base text-muted-foreground">Open it at the register with the float that is in the till.</p>
            </>
          )}
        </div>
        <Button asChild className="h-14 w-full px-6 text-lg sm:w-auto">
          <Link href="/pos">
            <ICONS.cash />
            {openSession ? "Count and close" : "Open the drawer"}
          </Link>
        </Button>
      </section>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={ICONS.cash}
            title="No drawers yet"
            hint="Open the drawer at the register at the start of the day, and count it at the end. Each day shows here."
            action={
              <Button asChild className="h-12 px-6 text-base">
                <Link href="/pos">Open today&rsquo;s drawer</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <FilterTabs
              aria-label="Drawer views"
              tabs={DRAWER_VIEWS.map((option) => ({
                label: option.label,
                href: option.value ? `/pos/drawers?view=${option.value}` : "/pos/drawers",
                active: view === option.value,
                count: counts[option.value],
              }))}
            />
            <p className="text-base text-muted-foreground">{drawerOffSentence(counts)}</p>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong px-5 py-6 text-base text-muted-foreground">
              No drawers in this view.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {shown.map((session) => {
                const words = drawerCardWords(session, zone);
                const meta = words.verdict === "open" ? null : DRAWER_VERDICT_META[words.verdict];
                return (
                  <li
                    key={session.id}
                    className={cn(
                      "flex h-full flex-col gap-3 rounded-2xl border bg-surface p-4",
                      words.verdict === "short" ? "border-status-overdue/50" : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="rf-num text-xl font-semibold leading-tight text-foreground">{words.title}</p>
                        <p className="text-[15px] text-muted-foreground">{words.when}</p>
                      </div>
                      <StatusPill
                        className="shrink-0"
                        tone={meta?.tone ?? "info"}
                        label={meta?.label ?? (session.closedAt ? "Closed" : "Open")}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <MetaChip>Float {formatCents(session.openingCents)}</MetaChip>
                      {session.expectedCents !== null ? (
                        <MetaChip>Should be {formatCents(session.expectedCents)}</MetaChip>
                      ) : null}
                      {session.countedCents !== null ? (
                        <MetaChip>Counted {formatCents(session.countedCents)}</MetaChip>
                      ) : null}
                    </div>

                    {session.note ? (
                      <p className="rounded-xl bg-surface-hover px-3.5 py-2.5 text-[15px] leading-relaxed text-muted-foreground">
                        {session.note}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="min-w-0 truncate text-[14px] text-muted-foreground">
                        {session.openedBy.name}
                        {session.closedBy ? ` → ${session.closedBy.name}` : ""}
                      </span>
                      {session.closedAt ? (
                        <Button asChild variant="outline" className="h-12 px-4 text-[15px]">
                          <Link href={`/print/drawers/${session.id}`} target="_blank">
                            <ACTIONS.print />
                            End-of-day report
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
