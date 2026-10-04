import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, ChevronRight, Phone } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { telHref } from "@/components/customers/customer-facts";
import { tilesLayoutClass, type BalanceBlock, type BalanceState, type QuoteBlock, type WhenTone } from "./bill-display";

/**
 * The top of the POS-style bill screen (Easy mode), for an invoice or an
 * estimate.
 *
 *   <- Invoices
 *   +--------------------------------+
 *   | Invoice #1014   (Sent)         |   a summary rail, like the total
 *   | Okonkwo Dental Group >         |   panel of a till: who, how much,
 *   | (512) 555-0178        [Call]   |   the one big button, a few tiles
 *   | +----------------------------+ |
 *   | | $450.00 due                | |
 *   | | Overdue since Oct 2        | |
 *   | | Collected so far ...       | |
 *   | +----------------------------+ |
 *   | [      Take payment          ] |
 *   | [Send again][Message][Print]   |
 *   +--------------------------------+
 *
 * Layout only. The page decides which actions exist and which one is the big
 * button; the words come from `bill-display.ts`. On a phone the big button is
 * not drawn here but pinned above the bottom bar (`PinnedAction`), so it is
 * never a scroll away.
 */

export function BackLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      data-touch-control
      className="inline-flex min-h-12 w-fit items-center gap-2 rounded-lg pr-3 text-base font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden className="size-5 shrink-0" />
      {label}
    </Link>
  );
}

const BOX_TONE: Record<BalanceState | "quote" | "quote-late", string> = {
  due: "border-border bg-surface-hover",
  overdue: "border-status-overdue/50 bg-status-overdue-bg",
  paid: "border-status-resolved/40 bg-status-resolved-bg",
  draft: "border-border bg-surface-hover",
  void: "border-border bg-surface-hover",
  quote: "border-border bg-surface-hover",
  "quote-late": "border-status-overdue/50 bg-status-overdue-bg",
};

const WHEN_TONE: Record<WhenTone, string> = {
  alert: "font-semibold text-status-overdue-fg",
  good: "font-semibold text-status-resolved-fg",
  muted: "text-muted-foreground",
  plain: "font-semibold text-foreground",
};

function WhenLine({ text, tone }: { text: string; tone: WhenTone }) {
  const Icon = tone === "alert" ? AlertCircle : tone === "good" ? Check : null;
  return (
    <p className={cn("flex items-start gap-1.5 text-base leading-snug", WHEN_TONE[tone])}>
      {Icon ? <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" /> : null}
      <span>{text}</span>
    </p>
  );
}

/**
 * THE HERO: the amount due in very large type, when it is due in words, and
 * what has been collected. "Paid in full", "Draft" and "Voided" stand where the
 * figure would be, so the state is always a word and never only a colour.
 */
export function BalanceHero({ block, className }: { block: BalanceBlock; className?: string }) {
  const figureTone =
    block.state === "overdue"
      ? "text-status-overdue-fg"
      : block.state === "paid"
        ? "text-status-resolved-fg"
        : block.state === "void"
          ? "text-faint-foreground line-through"
          : "text-foreground";

  return (
    <div
      data-state={block.state}
      className={cn("flex flex-col gap-2 rounded-xl border p-4", BOX_TONE[block.state], className)}
    >
      {block.figure ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("rf-num text-[44px] font-bold leading-none tracking-tight tabular-nums", figureTone)}>
            {block.figure}
          </span>
          <span className="text-xl font-semibold text-muted-foreground">{block.word}</span>
        </p>
      ) : (
        <p className={cn("flex items-center gap-2 text-[34px] font-bold leading-none tracking-tight", figureTone)}>
          {block.state === "paid" ? <Check aria-hidden className="size-8 shrink-0" strokeWidth={3} /> : null}
          {block.word}
        </p>
      )}
      <WhenLine text={block.when} tone={block.whenTone} />
      <p className="rf-num text-sm leading-snug text-muted-foreground">{block.collected}</p>
    </div>
  );
}

/** The estimate's hero: the quoted total, where the quote stands, and the date that matters. */
export function QuoteHero({ block, expired, className }: { block: QuoteBlock; expired: boolean; className?: string }) {
  return (
    <div
      data-state={expired ? "expired" : "quote"}
      className={cn("flex flex-col gap-2 rounded-xl border p-4", BOX_TONE[expired ? "quote-late" : "quote"], className)}
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "rf-num text-[44px] font-bold leading-none tracking-tight tabular-nums",
            expired ? "text-status-overdue-fg" : "text-foreground",
          )}
        >
          {block.figure}
        </span>
        <span className="text-xl font-semibold text-muted-foreground">{block.word}</span>
      </p>
      <p className="text-base font-semibold leading-snug text-foreground">{block.state}</p>
      {block.when ? <WhenLine text={block.when} tone={block.whenTone} /> : null}
    </div>
  );
}

/** "Call": a 48px pill with the phone glyph and the word. The number itself is printed beside the name. */
export function CallLink({ phone, who, className }: { phone: string; who: string; className?: string }) {
  return (
    <a
      href={telHref(phone)}
      data-touch-control
      aria-label={`Call ${who} on ${phone}`}
      className={cn(
        "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-accent-soft px-4 text-base font-semibold text-accent-soft-foreground transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Phone aria-hidden className="size-5 shrink-0" />
      Call
    </a>
  );
}

/**
 * The summary card. On a wide tablet it is the right-hand rail (one column);
 * on a narrower one it is two columns inside a full-width card (who and how
 * much on the left, what to do on the right); on a phone it is one column and
 * the big button is left out because `PinnedAction` carries it.
 */
export function BillSummary({
  title,
  status,
  customer,
  hero,
  primary,
  tiles,
  tileCount,
  hint,
  className,
}: {
  /** "Invoice #1014". */
  title: string;
  /** The status badge. Sits beside the title, never only a colour. */
  status: React.ReactNode;
  customer: { name: string; href: string; phone: string | null };
  /** `BalanceHero` or `QuoteHero`. */
  hero: React.ReactNode;
  /** The one big button, or null. Drawn from `sm` up. */
  primary: React.ReactNode;
  /** The quick tiles. */
  tiles: React.ReactNode;
  /** How many tiles there are, so they can share their rows evenly. */
  tileCount: number;
  /** "Last sent 16d ago by email". */
  hint?: string | null;
  className?: string;
}) {
  return (
    <section aria-label="Summary" className={cn("rounded-2xl border border-border bg-surface p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-6 lg:flex lg:gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 break-words text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">
              {title}
            </h1>
            {status}
          </div>

          {/* Who it is for: the name, then their number with a big Call beside it. */}
          <div className="flex flex-col gap-1">
            <Link
              href={customer.href}
              data-touch-control
              className="inline-flex min-h-12 w-fit max-w-full items-center gap-1 rounded-lg text-lg font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-words">{customer.name}</span>
              <ChevronRight aria-hidden className="size-5 shrink-0" />
            </Link>
            {customer.phone ? (
              <div className="flex items-center justify-between gap-3">
                <span className="rf-num min-w-0 truncate text-lg tabular-nums text-foreground">{customer.phone}</span>
                <CallLink phone={customer.phone} who={customer.name} />
              </div>
            ) : null}
          </div>

          {hero}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {primary ? <div className="hidden sm:block">{primary}</div> : null}
          <div className={tilesLayoutClass(tileCount)}>{tiles}</div>
          {hint ? <p className="text-sm leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The big button pinned just above the phone's bottom bar, with the amount
 * beside it when there is one, so the next step is on screen however far the
 * bill has been scrolled. Phone only: from `sm` up the button is in the summary.
 *
 * `sticky`, not `fixed`, for the reason the register's pay bar gives: it lives
 * in the page's own column so it can never cover the bar or the rail. The
 * shell's <main> carries 7rem of bottom padding and `sticky` measures from
 * inside it; the negative offset puts the bar 12px off the real edge.
 */
export function PinnedAction({
  caption,
  children,
}: {
  caption?: { label: string; value: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label="Next step"
      className="sticky bottom-[-6.25rem] z-20 -mx-1 flex items-center gap-3 rounded-xl border border-border-strong bg-surface p-2.5 shadow-lg sm:hidden print:hidden"
    >
      {caption ? (
        <div className="flex shrink-0 flex-col pl-1.5">
          <span className="text-[12.5px] font-semibold leading-tight text-muted-foreground">{caption.label}</span>
          <span className="rf-num text-2xl font-bold leading-tight tracking-tight tabular-nums text-foreground">
            {caption.value}
          </span>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
