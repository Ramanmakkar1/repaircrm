import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";

/**
 * Previous / Today / Next and the range they are moving through.
 *
 * Easy mode: three big buttons with words on them (a finger and a glove can
 * hit "Next" without aiming) and the range as a real heading beside them. Full
 * mode keeps the compact icon pair it always had.
 *
 * Every link keeps `scroll={false}`: paging through weeks must not throw the
 * page back to the top.
 */
export function CalendarNav({
  title,
  prevHref,
  todayHref,
  nextHref,
  simple,
  hideTitle = false,
}: {
  title: string;
  prevHref: string;
  todayHref: string;
  nextHref: string;
  simple: boolean;
  /** Easy mode with the title drawn elsewhere: only the three buttons. */
  hideTitle?: boolean;
}) {
  if (!simple) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="icon" asChild>
          <Link href={prevHref} scroll={false} aria-label="Previous">
            <ACTIONS.back />
          </Link>
        </Button>
        <Button variant="outline" size="icon" asChild>
          <Link href={nextHref} scroll={false} aria-label="Next">
            <ACTIONS.next />
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={todayHref} scroll={false}>
            Today
          </Link>
        </Button>
        <span className="ml-1.5 flex items-center gap-2 text-[14px] font-semibold text-foreground">
          <ICONS.appointment className="size-4 text-muted-foreground" />
          {title}
        </span>
      </div>
    );
  }

  const big = "h-12 flex-1 px-5 text-base sm:flex-none [&_svg]:size-5";

  const buttons = (
      <div className="grid grid-cols-3 gap-2 sm:flex">
        <Button variant="outline" size="lg" className={big} asChild>
          <Link href={prevHref} scroll={false}>
            <ACTIONS.back />
            Previous
          </Link>
        </Button>
        <Button variant="outline" size="lg" className={big} asChild>
          <Link href={todayHref} scroll={false}>
            Today
          </Link>
        </Button>
        <Button variant="outline" size="lg" className={big} asChild>
          <Link href={nextHref} scroll={false}>
            Next
            <ACTIONS.next />
          </Link>
        </Button>
      </div>
  );

  if (hideTitle) return buttons;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground">
        <ICONS.appointment className="size-6 shrink-0 text-muted-foreground" aria-hidden />
        {title}
      </p>
      {buttons}
    </div>
  );
}
