import Link from "next/link";

import { TimeAgo } from "@/components/platform/console-ui";
import { cn } from "@/components/ui/cn";
import { ACTIVITY_KIND_LABELS, type ActivityItem, type ActivityKind } from "@/lib/platform-activity";

const KIND_STYLES: Record<ActivityKind, string> = {
  signup: "bg-status-new-bg text-status-new-fg",
  signin: "bg-status-ready-bg text-status-ready-fg",
  important: "bg-status-in-progress-bg text-status-in-progress-fg",
  feedback: "bg-status-waiting-bg text-status-waiting-fg",
  other: "bg-surface-hover text-muted-foreground",
};

export function KindPill({ kind }: { kind: ActivityKind }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", KIND_STYLES[kind])}>
      {ACTIVITY_KIND_LABELS[kind]}
    </span>
  );
}

/**
 * One line per event: what happened in the shop's own words, who did it and
 * where. Text from shops (summaries, names, feedback titles) is rendered as
 * text only — React escapes it.
 */
export function ActivityList({
  items,
  now,
  showShop = true,
  empty = "Nothing has happened yet.",
}: {
  items: readonly ActivityItem[];
  now: Date;
  showShop?: boolean;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[15px] text-muted-foreground">{empty}</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <KindPill kind={item.kind} />
              <p className="min-w-0 break-words text-[15px] font-medium leading-6">{item.title}</p>
            </div>
            {item.actor || (showShop && item.shop) ? (
              <p className="mt-0.5 break-words text-sm text-muted-foreground">
                {item.actor ? <span>{item.actor}</span> : null}
                {item.actor && showShop && item.shop ? <span aria-hidden="true"> · </span> : null}
                {showShop && item.shop ? (
                  <Link
                    href={`/platform/shops/${item.shop.id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {item.shop.name}
                  </Link>
                ) : null}
              </p>
            ) : null}
          </div>
          <TimeAgo value={item.at} now={now} className="shrink-0 whitespace-nowrap text-sm text-faint-foreground sm:pt-0.5" />
        </li>
      ))}
    </ol>
  );
}
