import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon } from "./icons";

/**
 * One card, one price, and a plain list of what is genuinely not built yet.
 *
 * There are no invented tiers here because there is no billing in the product:
 * signing up creates a shop and nothing ever asks for a card. Naming the gaps
 * next to the price is the point — a shop owner finding out about the missing
 * card processing on day three is worse than reading it here.
 */

const INCLUDED = [
  "Every feature — nothing locked behind a tier",
  "Unlimited tickets, invoices, customers and products",
  "Your whole team, with owner, tech and front-desk roles",
  "Customer portal and the wall display included",
  "CSV export of your customers, invoices and payments, whenever",
];

const NOT_YET = [
  "A one-click importer from another system — ask us and we'll help by hand",
  "Built-in card processing — online payments run through your own Stripe account",
];

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-16 border-t border-border py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
              Pricing
            </p>
            <h2
              id="pricing-heading"
              className="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[44px]"
            >
              Free while it&rsquo;s early.
            </h2>
            <p className="mt-5 text-[16.5px] leading-relaxed text-muted-foreground">
              RepairFlow is new. Rather than guess at a price for software that
              is still growing, it costs nothing while it&rsquo;s in early
              access. Paid plans will come later, once it has earned them —
              we&rsquo;ll tell you well before anything changes, and your data
              stays exportable the whole time.
            </p>

            <div className="mt-8 rounded-lg border border-border bg-surface-hover p-5">
              <p className="text-[13px] font-bold tracking-tight text-foreground">
                What isn&rsquo;t here yet
              </p>
              <ul className="mt-3 space-y-2">
                {NOT_YET.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-[9px] size-1 shrink-0 rounded-full bg-faint-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-7 shadow-lg sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-bold tracking-tight text-foreground">
                Early access
              </p>
              <span className="flex items-center gap-1.5 rounded-full bg-status-ready-bg px-2.5 py-1 text-[11.5px] font-semibold text-status-ready-fg">
                <span className="size-1.5 rounded-full bg-status-ready" />
                Open now
              </span>
            </div>

            <p className="mt-5 flex items-baseline gap-2">
              <span className="rf-nums text-[56px] font-bold leading-none tracking-[-0.04em] text-foreground">
                $0
              </span>
              <span className="text-[14px] text-muted-foreground">
                per shop, per month
              </span>
            </p>

            <ul className="mt-7 space-y-3 border-t border-border pt-7">
              {INCLUDED.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-[14.5px] leading-relaxed text-foreground"
                >
                  <CheckIcon className="mt-0.5 size-[18px] shrink-0 text-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Button asChild size="lg" className="mt-8 w-full">
              <Link href="/signup">
                Start free
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <p className="mt-3 text-center text-[13px] text-faint-foreground">
              No credit card. Nothing in RepairFlow asks for one.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
