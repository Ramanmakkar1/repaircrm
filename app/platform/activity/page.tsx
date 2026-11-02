import Link from "next/link";

import { ActivityList } from "@/components/platform/activity-list";
import { ConsoleShell } from "@/components/platform/console-shell";
import { PageTitle } from "@/components/platform/console-ui";
import { ACTIVITY_FILTERS, ACTIVITY_FILTER_LABELS, type ActivityFilter } from "@/lib/platform-activity";
import { readActivityFeed } from "@/lib/platform-shops";

export const metadata = { title: "Activity · Operator console" };

function activityHref(filter: ActivityFilter, before?: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("show", filter);
  if (before) params.set("before", before);
  const search = params.toString();
  return search ? `/platform/activity?${search}` : "/platform/activity";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // readActivityFeed() checks the operator session before any cross-shop read.
  const { admin, now, filter, isFirstPage, items, next } = await readActivityFeed(await searchParams);

  return (
    <ConsoleShell admin={admin} current="activity">
      <PageTitle
        title="Activity"
        intro="What is happening across every shop, newest first: new shops, sign-ins, important changes and product feedback."
      />

      <nav aria-label="Show activity" className="mb-4 flex flex-wrap gap-2">
        {ACTIVITY_FILTERS.map((option) => (
          <Link
            key={option}
            href={activityHref(option)}
            aria-current={filter === option ? "page" : undefined}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border-strong bg-surface px-4 text-[15px] font-medium hover:bg-surface-hover aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            {ACTIVITY_FILTER_LABELS[option]}
          </Link>
        ))}
      </nav>

      <section aria-label={`${ACTIVITY_FILTER_LABELS[filter]} activity`} className="rounded-lg border border-border bg-surface px-4 py-4 sm:px-5">
        <ActivityList
          items={items}
          now={now}
          empty={isFirstPage ? "Nothing here yet." : "There is nothing older than this."}
        />
      </section>

      <nav aria-label="Older and newer activity" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[15px]">
        {isFirstPage ? (
          <span />
        ) : (
          <Link href={activityHref(filter)} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Back to newest
          </Link>
        )}
        {next ? (
          <Link href={activityHref(filter, next)} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Show older
          </Link>
        ) : null}
      </nav>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        <strong className="font-semibold text-foreground">Sign-ins</strong> include staff switching with their PIN at a shared till.{" "}
        <strong className="font-semibold text-foreground">Important</strong> covers deletion requests, refunds and voided invoices, deleted
        records, locked sign-ins, and changes to who can get in (invites, roles, switched-off logins, two-step sign-in, API keys). Times are
        shown as &ldquo;how long ago&rdquo;; point at one to see the exact time in UTC.
      </p>
    </ConsoleShell>
  );
}
