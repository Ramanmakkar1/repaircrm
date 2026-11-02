import Link from "next/link";
import {
  CreditCard,
  FileText,
  HardDrive,
  MessageSquare,
  Store,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";

import { ActivityList } from "@/components/platform/activity-list";
import { ConsoleShell } from "@/components/platform/console-shell";
import {
  PageTitle,
  Panel,
  RecountStorage,
  ShareBar,
  StatTile,
  StatusPill,
} from "@/components/platform/console-ui";
import { formatBytes, formatCount, formatMoney, percentOf } from "@/lib/platform-format";
import { readPlatformOverview } from "@/lib/platform-shops";

export const metadata = { title: "Operator console · Repairs helper" };

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * The owner's first look: every shop on the platform in a handful of big
 * numbers, who takes the most space, and what just happened.
 */
export default async function PlatformOverviewPage() {
  // readPlatformOverview() checks the operator session before any cross-shop read.
  const { admin, now, totals, last30Days, newFeedback, biggest, recent, storage } = await readPlatformOverview();
  const [mainCurrency, ...otherCurrencies] = totals.payments;
  const recentFor = (currency: string) => last30Days.payments.find((entry) => entry.currency === currency);
  const largest = biggest[0]?.storageBytes ?? 0;

  return (
    <ConsoleShell admin={admin} current="overview">
      <PageTitle
        title="Overview"
        intro="Every shop on Repairs helper at a glance. Tap a box to see the shops behind it."
      >
        <RecountStorage countedAt={storage.countedAt} now={now} />
      </PageTitle>

      <section aria-label="Platform totals" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Store}
          label="Shops"
          value={formatCount(totals.shops)}
          href="/platform/shops"
          detail={`${formatCount(totals.byStatus.active)} active · ${formatCount(totals.byStatus.quiet)} quiet · ${formatCount(totals.byStatus.closing)} being deleted`}
        />
        <StatTile
          icon={UserPlus}
          label="New shops this week"
          value={formatCount(totals.newLast7Days)}
          href="/platform/activity?show=signup"
          detail={`${plural(totals.newLast30Days, "new shop")} in the last 30 days`}
        />
        <StatTile
          icon={Users}
          label="Staff who can sign in"
          value={formatCount(totals.activeStaff)}
          detail={
            <>
              {formatCount(last30Days.signedInStaff)} signed in during the last 30 days
              {totals.staff > totals.activeStaff ? ` · ${formatCount(totals.staff - totals.activeStaff)} switched off` : ""}
            </>
          }
        />
        <StatTile
          icon={HardDrive}
          label="Space used"
          value={formatBytes(totals.storageBytes)}
          href="/platform/shops?sort=storage"
          detail={
            <>
              Files {formatBytes(totals.fileBytes)} ·{" "}
              {storage.estimateAvailable ? `records about ${formatBytes(totals.databaseBytes)}` : "records not counted"}
              {storage.databaseSizeBytes !== null ? (
                <span className="block">Whole database {formatBytes(storage.databaseSizeBytes)}</span>
              ) : null}
            </>
          }
        />
        <StatTile
          icon={Wrench}
          label="Repairs"
          value={formatCount(totals.repairs)}
          detail={`${formatCount(last30Days.repairs)} booked in the last 30 days`}
        />
        <StatTile
          icon={FileText}
          label="Invoices"
          value={formatCount(totals.invoices)}
          detail={`${formatCount(last30Days.invoices)} made in the last 30 days`}
        />
        <StatTile
          icon={CreditCard}
          label="Payments taken"
          value={mainCurrency ? formatMoney(mainCurrency.cents, mainCurrency.currency) : formatMoney(0, "USD")}
          detail={
            mainCurrency ? (
              <>
                {formatMoney(recentFor(mainCurrency.currency)?.cents ?? 0, mainCurrency.currency)} in the last 30 days
                <span className="block">{plural(mainCurrency.count, "payment")} in all, before refunds</span>
                {otherCurrencies.map((entry) => (
                  <span key={entry.currency} className="block">
                    Also {formatMoney(entry.cents, entry.currency)} in {entry.currency} ({plural(entry.count, "payment")})
                  </span>
                ))}
              </>
            ) : (
              "No payments recorded yet"
            )
          }
        />
        <StatTile
          icon={MessageSquare}
          label="New feedback"
          value={formatCount(newFeedback)}
          href="/platform/feedback?status=NEW"
          detail={newFeedback === 1 ? "Report waiting to be read" : "Reports waiting to be read"}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel
          id="most-space"
          title="Shops using the most space"
          detail="Files plus database records, biggest first."
          action={
            <Link href="/platform/shops?sort=storage" className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline">
              All shops
            </Link>
          }
        >
          {biggest.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No shops have signed up yet.</p>
          ) : (
            <ol className="space-y-4">
              {biggest.map((shop) => (
                <li key={shop.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/platform/shops/${shop.id}`}
                        className="min-w-0 break-words text-[15px] font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {shop.name}
                      </Link>
                      <StatusPill status={shop.status} />
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">{formatBytes(shop.storageBytes)}</span>
                  </div>
                  <ShareBar percent={percentOf(shop.storageBytes, largest)} className="mt-2" />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Files {formatBytes(shop.fileBytes)} · records {shop.database ? `about ${formatBytes(shop.database.bytes)}` : "not counted"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          id="latest-activity"
          title="Latest activity"
          detail="New shops, sign-ins, changes and feedback, newest first."
          action={
            <Link href="/platform/activity" className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline">
              All activity
            </Link>
          }
        >
          <ActivityList items={recent} now={now} />
        </Panel>
      </div>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        Shops have no plans or trials yet, so a shop is <strong className="font-semibold text-foreground">active</strong> (used in the last 30 days),{" "}
        <strong className="font-semibold text-foreground">quiet</strong> (nothing for 30 days) or{" "}
        <strong className="font-semibold text-foreground">being deleted</strong> (the owner asked; its logins are off until the data is removed).
      </p>
    </ConsoleShell>
  );
}
