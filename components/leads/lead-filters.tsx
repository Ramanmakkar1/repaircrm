"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { TONE_CLASS } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { LEAD_STATUSES, LEAD_STATUS_META } from "./lead-meta";

export type LeadCounts = Record<string, number>;

/**
 * The inbox filter row.
 *
 * Like the ticket board, the pills own the URL rather than local state, so a
 * filtered inbox is shareable and the back button behaves. "open" is the
 * default view and is stripped from the query string.
 *
 * Every pill carries its own count. On an inbox that is the whole point — the
 * front desk needs to see that four new enquiries are waiting without clicking
 * into the filter to find out.
 */
export function LeadFilters({
  status,
  counts,
}: {
  status: string;
  counts: LeadCounts;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const pills = [
    { value: "open", label: "Open", count: counts.open ?? 0, meta: null },
    ...LEAD_STATUSES.map((key) => ({
      value: key,
      label: LEAD_STATUS_META[key].label,
      count: counts[key] ?? 0,
      meta: LEAD_STATUS_META[key],
    })),
    { value: "all", label: "All", count: counts.all ?? 0, meta: null },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={pending ? "" : undefined}
    >
      {pills.map((pill) => {
        const active = status === pill.value;
        return (
          <button
            key={pill.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              startTransition(() =>
                router.push(
                  pill.value === "open" ? "/leads" : `/leads?status=${pill.value}`,
                ),
              )
            }
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? pill.meta
                  ? cn(
                      "border-transparent shadow-sm",
                      TONE_CLASS[pill.meta.tone].chip,
                    )
                  : "border-transparent bg-accent text-accent-foreground shadow-sm"
                : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {pill.meta ? (
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  TONE_CLASS[pill.meta.tone].dot,
                )}
              />
            ) : null}
            {pill.label}
            <span
              className={cn(
                "tabular-nums",
                active ? "opacity-70" : "text-faint-foreground",
              )}
            >
              {pill.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
