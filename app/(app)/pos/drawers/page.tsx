import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Banknote, Printer } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  DRAWER_VERDICT_CLASS,
  drawerVerdict,
} from "@/components/pos/drawer-types";

export const metadata = { title: "Cash drawers · RepairFlow" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

/**
 * Drawer history — the shop's over/short record.
 *
 * OWNER only, and guarded by `requireRole` rather than a hidden link: a
 * technician who types the URL gets bounced, because a pattern of short
 * drawers is a management conversation, not shop-floor reading.
 *
 * Cards rather than a table. A drawer session is four numbers and a verdict,
 * and the verdict is the thing the eye should land on.
 */
export default async function DrawersPage() {
  const { shopId } = await requireRole("OWNER");

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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/pos"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to the register
      </Link>

      <PageHeader
        title="Cash drawers"
        description="Every open and close, with what the till was expected to hold and what it actually held."
      />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={Banknote}
            title="No drawer sessions yet"
            hint="Open the drawer at the register and the first session will appear here."
            action={
              <Button asChild>
                <Link href="/pos">Go to the register</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const closed = session.closedAt !== null;
            // A live drawer has no verdict — nothing has been counted yet.
            const difference =
              closed && session.countedCents !== null && session.expectedCents !== null
                ? session.countedCents - session.expectedCents
                : null;
            const verdict = difference === null ? null : drawerVerdict(difference);

            return (
              <div
                key={session.id}
                className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-foreground">
                      {format(session.openedAt, "EEE, MMM d")}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {format(session.openedAt, "h:mm a")} –{" "}
                      {session.closedAt ? format(session.closedAt, "h:mm a") : "open"}
                    </div>
                  </div>

                  {verdict ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 font-mono text-[13px] font-bold tabular-nums",
                        DRAWER_VERDICT_CLASS[verdict],
                      )}
                    >
                      {verdict === "balanced"
                        ? "Balanced"
                        : `${difference! > 0 ? "+" : ""}${formatCents(difference!)}`}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-[13px] font-bold text-accent-soft-foreground">
                      Open
                    </span>
                  )}
                </div>

                <dl className="flex flex-col gap-1.5 border-t border-border pt-3.5 text-[13.5px]">
                  <Row label="Opening float" value={formatCents(session.openingCents)} />
                  <Row
                    label="Expected"
                    value={
                      session.expectedCents === null
                        ? "—"
                        : formatCents(session.expectedCents)
                    }
                  />
                  <Row
                    label="Counted"
                    value={
                      session.countedCents === null
                        ? "—"
                        : formatCents(session.countedCents)
                    }
                  />
                </dl>

                {session.note ? (
                  <p className="rounded-md bg-surface-hover px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    {session.note}
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5">
                  <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                    {session.openedBy.name}
                    {session.closedBy ? ` → ${session.closedBy.name}` : ""}
                  </span>
                  {closed ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/print/drawers/${session.id}`}>
                        <Printer className="size-4" />
                        Z-report
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
