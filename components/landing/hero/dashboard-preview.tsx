import { ChevronDown, TrendingUp, X } from "lucide-react";

import { Gauge } from "./gauge";

/**
 * The tray of three dashboard cards at the bottom of the hero.
 *
 * It is a drawing, not a working screen: every number is sample data (the
 * caption says so), and nothing in it can be focused or clicked. The cards are
 * plain divs inside an `inert` wrapper, and the whole tray is one labelled
 * image for assistive technology, so keyboard and screen-reader users never
 * land in a fake form.
 */

const LABEL =
  "Preview of a repair shop dashboard with sample data: takings this month at 92 percent of a 7,500 dollar target, a form for setting sales targets, and 8 repairs ready for pickup today.";

const card = "rounded-2xl bg-white p-5";

function Toggle({ active, other }: { active: string; other: string }) {
  return (
    <div className="mt-4 flex rounded-full bg-neutral-100 p-1 text-[12px]">
      <span className="flex-1 rounded-full bg-white px-3 py-1.5 text-center font-medium text-neutral-900 shadow-sm">
        {active}
      </span>
      <span className="flex-1 px-3 py-1.5 text-center text-neutral-600">{other}</span>
    </div>
  );
}

function Dropdown({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-neutral-700">{label}</p>
      <div className="mt-1 flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900">
        {value}
        <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
      </div>
    </div>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-neutral-700">{label}</p>
      <div className="mt-1 flex items-center rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900">
        <span className="mr-2 text-neutral-500">#</span>
        {value}
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className="px-3 sm:px-4">
      <div
        role="img"
        aria-label={LABEL}
        className="mx-auto w-full max-w-[880px] rounded-3xl bg-(--site-tray) p-4 sm:p-6"
      >
        <p className="mb-3 text-[11px] font-medium text-neutral-600">Sample shop data</p>
        <div
          inert
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        >
          {/* Card 1: takings */}
          <div className={card}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-(--site-accent-ink)">Takings</span>
              <span className="text-neutral-500">This Month</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[28px] font-semibold leading-none tracking-tight text-neutral-900">
                $6,896
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                <TrendingUp className="h-3 w-3" />
                +$1,284 (23%)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Compared to last month</p>
            <p className="mt-4 text-center text-[13px] text-neutral-700">Month target achieved</p>
            <Gauge value={92} showLabels min="$0" max="$7.5K" />
            <Toggle active="Sales" other="Repairs" />
          </div>

          {/* Card 2: the form */}
          <div className={`${card} flex flex-col gap-3`}>
            <Dropdown label="Show figures for" value="This month" />
            <Dropdown label="Compare period by" value="Month-to-date" />
            <Target label="Sales target (this month)" value="7,500" />
            <Target label="Sales target (this year)" value="90,000" />
            <div className="mt-1 flex items-center gap-4">
              <span className="rounded-lg bg-(--site-accent-fill) px-5 py-2 text-[13px] font-semibold text-white">
                Save
              </span>
              <span className="text-[13px] text-neutral-700 underline">Cancel</span>
              <X className="ml-auto h-4 w-4 text-neutral-500" />
            </div>
          </div>

          {/* Card 3: ready for pickup */}
          <div className={card}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-(--site-accent-ink)">Ready for pickup</span>
              <span className="text-neutral-500">today</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[28px] font-semibold leading-none tracking-tight text-neutral-900">
                8
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                <TrendingUp className="h-3 w-3" />0
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Compared to yesterday</p>
            <div className="mt-9">
              <Gauge value={68} color="#9ca3af" />
            </div>
            <Toggle active="Ready" other="Waiting" />
          </div>
        </div>
      </div>
    </div>
  );
}
