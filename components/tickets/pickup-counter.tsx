import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PickupCard } from "./pickup-card";
import {
  PICKUP_TITLE_ID,
  pickupCountWords,
  pickupEmpty,
  toCollectWords,
  type PickupCardData,
} from "./pickup-card-facts";

/**
 * The Ready for pickup view of the Repairs page in Easy mode: a pickup counter.
 *
 *   Ready for pickup  [ 3 waiting ] [ $240.00 to collect ]
 *   Hand the device back and collect payment.
 *
 *   ( Open jobs ) ( Ready for pickup 3 ) ( Needs reply ) ...      <- the page's own tabs
 *   [ Search name, phone or #                        ] [ Search ]
 *
 *   [ card ] [ card ]
 *   [ card ] [ card ]
 *
 *   Previous      Page 1 of 2      Next
 *
 * The tabs and the pager are built by the page and handed in, so this view can
 * never show different tabs or different paging from the rest of Repairs.
 */
export function PickupCounter({
  cards,
  now,
  timeZone,
  total,
  q,
  tabs,
  pager,
  searchFields,
  clearHref,
  repairsHref,
  showTotals,
}: {
  cards: PickupCardData[];
  now: number;
  /** The shop's time zone (Shop.timezone), for "Ready since yesterday". */
  timeZone?: string | null;
  /** Every repair the filters match, across pages. */
  total: number;
  q: string;
  tabs: React.ReactNode;
  pager: React.ReactNode;
  /** Hidden inputs the search form posts, so a search keeps the view and its filters. */
  searchFields: [string, string][];
  /** The same view with the search cleared. */
  clearHref: string;
  /** Back to the ordinary Repairs list. */
  repairsHref: string;
  /** The money still to collect covers only the cards on screen, so it is shown only when they are all of them. */
  showTotals: boolean;
}) {
  const searching = q.trim() !== "";
  const toCollect = showTotals ? toCollectWords(cards.map((card) => card.money)) : null;
  const empty = pickupEmpty(q);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Focusable from script only: where focus lands when the last card on screen is handed over. */}
          <h1
            id={PICKUP_TITLE_ID}
            tabIndex={-1}
            className="text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground outline-none sm:text-[34px]"
          >
            Ready for pickup
          </h1>
          <span className="rf-num rounded-full bg-status-ready-bg px-3.5 py-1.5 text-base font-semibold leading-none text-status-ready-fg">
            {pickupCountWords(total, searching)}
          </span>
          {toCollect ? (
            <span className="rf-num rounded-full bg-status-in-progress-bg px-3.5 py-1.5 text-base font-semibold leading-none text-status-in-progress-fg">
              {toCollect}
            </span>
          ) : null}
        </div>
        <p className="text-base leading-snug text-muted-foreground">Hand the device back and collect payment.</p>
      </header>

      <div className="flex flex-col gap-3">
        {tabs}

        {/*
          A plain GET form: Enter on a tablet keyboard, or a scanned ticket
          label that ends in Enter, searches with no script needed.
        */}
        <form action="/tickets" method="get" role="search" className="flex flex-wrap items-center gap-2">
          {searchFields.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="relative min-w-[260px] flex-1">
            <ICONS.search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-faint-foreground"
            />
            <Input
              name="q"
              defaultValue={q}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search name, phone or #"
              aria-label="Search repairs waiting for pickup"
              className="h-14 rounded-xl pl-12 text-lg"
            />
          </div>
          <Button type="submit" size="lg" className="h-14 rounded-xl px-6 text-base max-sm:w-14 max-sm:px-0">
            <ACTIONS.search aria-hidden />
            <span className="max-sm:sr-only">Search</span>
          </Button>
          {/* With no match the empty card below already offers "Clear search": one Clear, not two. */}
          {searching && cards.length > 0 ? (
            <Button asChild variant="ghost" size="lg" className="h-14 rounded-xl px-4 text-base max-sm:w-full">
              <Link href={clearHref}>
                <ACTIONS.cancel aria-hidden />
                Clear
              </Link>
            </Button>
          ) : null}
        </form>
      </div>

      {cards.length === 0 ? (
        <Card className="rounded-2xl shadow-none">
          <EmptyState
            icon={ICONS.ticket}
            title={empty.title}
            hint={empty.hint}
            action={
              empty.action === "clear" ? (
                <div className="flex flex-wrap justify-center gap-2.5">
                  <Button asChild size="lg" className="h-12 px-6 text-base">
                    <Link href={clearHref}>Clear search</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
                    <Link href={repairsHref}>Go to Repairs</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild size="lg" className="h-12 px-6 text-base">
                  <Link href={repairsHref}>Go to Repairs</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {cards.map((card) => (
              <li key={card.id}>
                <PickupCard card={card} now={now} timeZone={timeZone} className="h-full" />
              </li>
            ))}
          </ul>
          {pager}
        </div>
      )}
    </div>
  );
}
