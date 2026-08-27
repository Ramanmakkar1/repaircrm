import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Screenshot primitives for the landing page.
 *
 * Every image these render is a real, unretouched capture of the running app
 * against seeded demo data. There is no stock photography, no invented UI and
 * no rendering of a feature that doesn't exist — so the frames only have one
 * job: give a flat JPEG enough physical presence to read as a screen rather
 * than a rectangle pasted onto the page.
 *
 * Rules kept in one place so no caller has to remember them:
 *
 *  - every <Image> gets explicit width/height, so nothing reflows as it loads
 *  - sources are captured at 1512px (or cropped from one) and displayed at
 *    roughly half to two-thirds of that, which is what keeps them sharp on a
 *    retina panel instead of soft
 *  - only the hero loads eagerly; everything else lazy-loads, which is
 *    next/image's default and is left implicit nowhere — `eager` is opt-in
 *
 * Next 16 note: `priority` was deprecated in favour of `preload` (see
 * node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md),
 * so the hero opts in with `preload` rather than the prop most examples use.
 */

type ShotProps = {
  src: string;
  alt: string;
  /** Intrinsic pixel size of the file — never the display size. */
  width: number;
  height: number;
  sizes: string;
  /** Hero only: preload instead of lazy-loading. */
  eager?: boolean;
};

export function Shot({ src, alt, width, height, sizes, eager }: ShotProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      {...(eager ? { preload: true } : { loading: "lazy" as const })}
      className="block h-auto w-full"
    />
  );
}

/**
 * A full-window capture, wrapped in the faux browser chrome the page used
 * before there were screenshots. Only whole-viewport shots get this — a
 * cropped detail in browser chrome would be claiming to be a window it isn't.
 */
export function BrowserFrame({
  url,
  children,
  hero,
}: {
  url: string;
  children: ReactNode;
  /** Deeper shadow for the one shot that carries the top of the page. */
  hero?: boolean;
}) {
  return (
    <div
      className={`${hero ? "rf-shot-hero" : "rf-shot"} overflow-hidden rounded-xl border border-border bg-surface`}
    >
      <div
        aria-hidden="true"
        className="flex h-9 items-center gap-4 border-b border-border bg-surface-hover px-3.5 sm:h-10 sm:px-4"
      >
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="mx-auto hidden max-w-[280px] flex-1 truncate rounded-full border border-border bg-surface px-3 py-1 text-center text-[10.5px] font-medium text-faint-foreground sm:block">
          {url}
        </div>
        <span className="hidden w-[54px] shrink-0 sm:block" />
      </div>

      {children}
    </div>
  );
}

/**
 * A cropped detail of the app — no chrome, just the same hairline border and
 * layered shadow, so it sits on the page as a card rather than pretending to
 * be a whole window.
 */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rf-shot overflow-hidden rounded-xl border border-border bg-surface">
      {children}
    </div>
  );
}

/**
 * The shop-wall display, framed as the monitor it actually runs on: a thin
 * dark bezel and a heavier shadow, so the one deliberately dark image on an
 * otherwise white page reads as hardware across the room rather than as a
 * section that forgot to be light.
 */
export function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rf-shot-screen rounded-2xl bg-[#17181c] p-2 ring-1 ring-inset ring-white/10 sm:p-2.5">
      <div className="overflow-hidden rounded-lg">{children}</div>
    </div>
  );
}

/**
 * A screenshot with a small card of real UI layered over its corner.
 *
 * The card sits *outside* the image on anything narrower than `lg`, stacked
 * underneath it, because a 260px card floating over a 335px-wide phone
 * screenshot would bury the thing it is annotating. Only at `lg`, where the
 * two-column row opens a 64px gutter, does it overlap — and it always leans
 * into that gutter (never toward the viewport edge), so it can't push the page
 * sideways on any width.
 */
export function ShotWithInset({
  shot,
  inset,
  side,
}: {
  shot: ReactNode;
  inset: ReactNode;
  /** Which way the card overhangs — always the side the column gutter is on. */
  side: "left" | "right";
}) {
  return (
    <div className="relative">
      {shot}
      <div
        className={`mt-4 lg:absolute lg:-bottom-9 lg:mt-0 lg:w-[262px] ${
          side === "left" ? "lg:-left-9" : "lg:-right-9"
        }`}
      >
        {inset}
      </div>
    </div>
  );
}
