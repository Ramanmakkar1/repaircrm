import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { locationWhere } from "@/lib/location";
import { loadShopOverview } from "@/lib/dashboard/overview";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { AssistantPanel } from "@/components/dashboard/assistant-panel";
import { BenchSection } from "@/components/dashboard/bench";
import { AppointmentsCard, StockWatchCard } from "@/components/dashboard/coming-up";
import { MyQueueSection } from "@/components/dashboard/my-queue";
import { NeedsYouSection } from "@/components/dashboard/needs-you";
import { OverviewHeader } from "@/components/dashboard/overview-header";
import { OwedCard } from "@/components/dashboard/owed-card";
import { TakingsHero } from "@/components/dashboard/takings-hero";
import { PopularCard, SellingCard, WorkloadCard } from "@/components/dashboard/team-demand";

export const metadata: Metadata = { title: "Shop overview · Repairs helper" };
// Every figure is "as of now"; a cached overview is a wrong overview.
export const dynamic = "force-dynamic";

/**
 * Shop overview: the page an owner opens every morning and again at closing.
 *
 * Top to bottom, each block either says something you can act on or opens the
 * screen where you act: a greeting and the two big buttons; today's takings and
 * what is owed (a technician sees their own queue instead: no money); the repair
 * pipeline; the few things that need you now; who is doing what, what sells and
 * what people bring in; and what is coming up.
 *
 * It is the same page in Easy and Full mode. The old `?view=due|ready|reply`
 * links still land here: the parameter is ignored, because every one of those
 * lists is one tap away: Due today, Overdue and Needs reply are the three count
 * pills over the pipeline, and Ready for pickup is a pipeline tile.
 */
export default async function DashboardPage() {
  const [user, branch] = await Promise.all([requireUser(), locationWhere()]);
  const overview = await loadShopOverview(user, branch);
  const { today, owed, myQueue, selling } = overview;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:gap-4">
      <OverviewHeader
        greeting={overview.greeting}
        firstName={overview.firstName}
        shopName={overview.shopName}
        branchName={overview.branchName}
        dateLabel={overview.dateLabel}
      />
      <SetupChecklist />

      {today && owed ? (
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <TakingsHero today={today} />
          <OwedCard owed={owed} />
        </div>
      ) : myQueue ? (
        <MyQueueSection queue={myQueue} now={overview.generatedAt} />
      ) : null}

      <BenchSection bench={overview.bench} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <NeedsYouSection rows={overview.needsYou.rows} candidates={overview.needsYou.candidates} />
          <div className={selling ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
            <WorkloadCard workload={overview.workload} />
            {selling ? <SellingCard selling={selling} /> : null}
            <PopularCard popular={overview.popular} />
          </div>
        </div>
        <aside aria-label="Coming up" className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <AppointmentsCard appointments={overview.appointments} />
          <StockWatchCard stock={overview.stockWatch} canOrder={overview.canOrder} />
          <AssistantPanel className="md:col-span-2 xl:col-span-1" />
        </aside>
      </div>
    </div>
  );
}
