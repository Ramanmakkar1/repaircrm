import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import {
  DRAWER_VERDICT_META,
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
        <ACTIONS.back className="size-4" />
        Back to the register
      </Link>

      <PageHeader
        title="Cash drawers"
        description="Every open and close, with what the till was expected to hold and what it actually held."
      />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.cash}
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
            const verdictMeta = verdict === null ? null : DRAWER_VERDICT_META[verdict];

            return (
              // Only a till that did not balance is worth a stripe; a
              // balanced or still-open drawer is a white card like any other.
              <Card
                key={session.id}
                tone={
                  verdict === "short"
                    ? "danger"
                    : verdict === "over"
                      ? "active"
                      : undefined
                }
                className="flex flex-col gap-4 p-5"
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

                  {/* The verdict is the thing the eye should land on, so it
                      is the one pill on the card. A live session has not been
                      counted yet and says so instead. */}
                  {verdict && verdictMeta ? (
                    <StatusPill
                      className="shrink-0 tabular-nums"
                      tone={verdictMeta.tone}
                      label={
                        // Balanced is the whole word on its own; over and short
                        // carry the amount, unsigned — the word is the sign.
                        verdict === "balanced"
                          ? verdictMeta.label
                          : `${verdictMeta.label} ${formatCents(Math.abs(difference ?? 0))}`
                      }
                    />
                  ) : (
                    <StatusPill className="shrink-0" tone="info" label="Open" />
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
                        <ACTIONS.print className="size-4" />
                        Z-report
                      </Link>
                    </Button>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
