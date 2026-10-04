"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Bell, ChevronRight } from "lucide-react";
import { countLabel, needsYouLabel, waitingItems, type AttentionItem } from "@/components/counter/attention";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { useAttention } from "./attention-provider";

/**
 * The bell in the controls row: one number for everything waiting on a
 * person, and one tap to a sheet that says what it is. The number is a word
 * on the button (never only a red dot), and the bell itself never moves, so a
 * person learns where to look.
 */
export function NeedsYouButton({ showOverview = true }: { showOverview?: boolean }) {
  const attention = useAttention();
  const [open, setOpen] = React.useState(false);
  const total = attention?.total ?? 0;
  const refresh = attention?.refresh;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          refresh?.();
        }}
        aria-label={needsYouLabel(total)}
        aria-haspopup="dialog"
        className="relative flex size-12 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground shadow-xs transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Bell className="size-5" aria-hidden />
        {/* The number sits on the bell, so the button stays one 48px square on a 320px phone. */}
        {total > 0 ? <CountPill count={total} className="absolute -right-2 -top-2 ring-2 ring-surface" /> : null}
      </button>
      <NeedsYouSheet open={open} onOpenChange={setOpen} items={attention?.items ?? []} loaded={attention?.loaded ?? false} showOverview={showOverview} />
    </>
  );
}

/** A count as a number in a pill: the number carries the meaning, the colour only adds weight. */
export function CountPill({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[13px] font-bold leading-none tabular-nums text-destructive-foreground",
        className,
      )}
    >
      {countLabel(count)}
    </span>
  );
}

export function NeedsYouSheet({
  open,
  onOpenChange,
  items,
  loaded,
  showOverview = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly AttentionItem[];
  loaded: boolean;
  showOverview?: boolean;
}) {
  const waiting = waitingItems(items);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88dvh,720px)] max-w-lg flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1 pr-12">
          <DialogTitle className="text-[22px] font-semibold tracking-tight">Needs you</DialogTitle>
          <DialogDescription className="text-[15px]">
            {waiting.length > 0 ? "Tap one to open the list." : loaded ? "Nothing is waiting. Nice work." : "Checking the shop…"}
          </DialogDescription>
        </div>
        {waiting.length > 0 ? (
          <ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
            {waiting.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
                    <Image src={item.photo} alt="" fill sizes="56px" className="object-contain p-1.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[17px] font-semibold leading-tight text-foreground">{item.label}</span>
                    <span className="text-[14px] leading-snug text-muted-foreground">{item.hint}</span>
                  </span>
                  <CountPill count={item.count} className="min-w-8 px-2.5 py-1 text-[15px]" />
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : loaded ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-8 text-center">
            <span className="relative size-24 overflow-hidden rounded-2xl bg-white">
              <Image src="/images/home/toolbox.webp" alt="" fill sizes="96px" className="object-contain p-2" />
            </span>
            <p className="text-[17px] font-semibold">All clear</p>
            <p className="text-[15px] text-muted-foreground">Nothing ready, late or unanswered right now.</p>
          </div>
        ) : null}
        {showOverview ? (
          <Link
            href="/dashboard"
            onClick={() => onOpenChange(false)}
            className="flex min-h-12 items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open Shop overview
          </Link>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
