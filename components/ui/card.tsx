import * as React from "react";
import { TONE_CLASS, type StatusTone } from "./badge";
import { cn } from "./cn";

/**
 * The box everything in RepairFlow lives in.
 *
 * The card is white on a light-gray canvas, so its own fill plus one hairline
 * is all the separation it needs — the shadow is now almost nothing on
 * purpose, and only true overlays (dropdowns, dialogs) really cast. An 8px
 * corner keeps it a panel of record rather than a friendly rounded box.
 *
 * There is exactly one card surface, one border, one radius and one shadow in
 * this app, and they are here. If a screen needs a card that carries a state,
 * it passes `tone` — which paints a 3px accent down the left edge and leaves
 * the other 99% of the card white. A screen where five cards shout is worse
 * than a screen where the one that matters does.
 */
export function Card({
  className,
  tone,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * The state this card is *about* — overdue, unpaid, low stock, a failed sync,
   * a short drawer. Renders as a left accent stripe, never a filled card.
   * Colour is a second signal here: the card's own text still says the word.
   */
  tone?: StatusTone;
  /** The whole card is a link or a button. Adds the shared hover/focus lift. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-sm",
        tone && cn("border-l-[3px]", TONE_ACCENT[tone]),
        interactive &&
          "transition-[box-shadow,border-color] hover:border-border-strong hover:shadow-md focus-within:border-border-strong focus-within:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

/** The left stripe for a `tone` card — the border colour half of each tone. */
const TONE_ACCENT: Record<StatusTone, string> = {
  neutral: "border-l-border-strong",
  info: "border-l-status-new",
  active: "border-l-status-in-progress",
  waiting: "border-l-status-waiting",
  ready: "border-l-status-ready",
  success: "border-l-status-resolved",
  danger: "border-l-status-overdue",
};

/**
 * The band across the top of a card: an optional icon, a title, an optional
 * one-line description under it, and an optional action pinned right.
 *
 * Two ways to use it, deliberately. Pass `title` (and whatever else) and you
 * get the standard arrangement every card in the app should share. Pass
 * `children` instead and it is the plain bordered band it has always been —
 * which the handful of cards with a genuinely custom header still need.
 */
export function CardHeader({
  className,
  icon: Icon,
  title,
  description,
  action,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: React.ComponentType<{ className?: string }>;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (title === undefined && children !== undefined) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 border-b border-border px-4 py-3",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2.5",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <Icon
            aria-hidden
            className="size-4 shrink-0 text-faint-foreground"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[14px] font-semibold tracking-[-0.01em] text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[13.5px] text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * 16px on every side. The hand-rolled bordered divs elsewhere in the app still
 * use `p-5`; they get tightened as each screen is converted, and until then a
 * 4px difference between a Card and its neighbour is the cheapest possible
 * symptom of the migration being half-done.
 */
export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The metric tile: one number, said once, in the same shape everywhere.
 *
 * Fixed slots so a row of them scans as a row rather than as five different
 * cards — tinted icon square top-left, the figure in tabular digits, the label
 * under it, and one optional line of context under that. The tint is the only
 * colour, and it comes from the shared tone set.
 */
export function StatTile({
  icon: Icon,
  tone = "neutral",
  value,
  label,
  hint,
  interactive = false,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatusTone;
  value: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Set when the tile is wrapped in a link — same hover/focus lift as `Card`. */
  interactive?: boolean;
}) {
  return (
    <Card
      interactive={interactive}
      className={cn("flex flex-col gap-2.5 p-4", className)}
      {...props}
    >
      {/*
        Label first, then the figure. A metric tile is read as "open tickets:
        ten", and putting the 40px number above its own caption made every row
        of tiles a row of orphaned digits. The tinted icon square that used to
        sit on top is gone — six tiles meant six coloured blocks competing for
        the same glance. Tone survives as a 6px dot, so `danger` still reads
        red without repainting an eighth of the screen.
      */}
      <div className="flex min-w-0 items-center gap-1.5">
        {tone !== "neutral" ? (
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASS[tone].dot)}
          />
        ) : null}
        {Icon ? (
          <Icon aria-hidden className="size-3.5 shrink-0 text-faint-foreground" />
        ) : null}
        <p className="truncate text-[12.5px] font-medium text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="rf-num text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </Card>
  );
}
