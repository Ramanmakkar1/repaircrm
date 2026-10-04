"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { InitialsVisual } from "@/components/ui/record-card";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SummaryRow } from "@/lib/customers/form-sections";

/**
 * "This customer": a live picture and the facts typed so far, with the one big
 * Save button under them. Beside the fields from the large layout up; on a phone
 * or small tablet the MobileBar below carries the picture and the button instead.
 */
export function SummaryPanel({
  name,
  mobile,
  rows,
  hint,
  saveLabel,
  cancelHref,
}: {
  /** displayName(): what the picture's initials are made from. Empty until something is typed. */
  name: string;
  /** Shown under the name; the parent leaves it empty when the name is already made from the number. */
  mobile: string;
  rows: SummaryRow[];
  /** Why saving is not possible yet, in words, or null. */
  hint: string | null;
  saveLabel: string;
  cancelHref: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">This customer</h2>
      <div className="flex items-center gap-4">
        <InitialsVisual name={name} className="size-20 text-3xl" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 break-words text-xl font-semibold leading-tight">
            {name || <span className="font-normal text-muted-foreground">No name yet</span>}
          </span>
          {mobile.trim() ? <span className="truncate text-[15px] text-muted-foreground">{mobile.trim()}</span> : null}
        </div>
      </div>
      <dl className="divide-y divide-border border-t border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-11 items-center gap-3 py-1">
            <dt className="w-24 shrink-0 text-sm text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug">
              {row.value || <span className="font-normal text-muted-foreground">Not added</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        {hint ? <p id="cf-reason" role="status" className="text-[15px] font-medium text-muted-foreground">{hint}</p> : null}
        <SubmitButton
          pendingLabel="Saving…"
          aria-describedby={hint ? "cf-reason" : undefined}
          aria-disabled={hint ? true : undefined}
          className={cn("h-14 w-full text-base", hint && "opacity-60")}
        >
          {saveLabel}
        </SubmitButton>
        <Button asChild variant="ghost" className="h-12 text-[15px]">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The phone's version: the live picture, who it is, and the one big Save
 * button, pinned to the bottom of the screen above the tab bar.
 */
export function MobileBar({
  name,
  mobile,
  hint,
  saveLabel,
}: {
  name: string;
  mobile: string;
  hint: string | null;
  saveLabel: string;
}) {
  return (
    <div
      role="region"
      aria-label="This customer"
      // Fixed just above the phone's tab bar (4rem tall; there is none from sm up, where the
      // assistant button sits at the right, hence the extra padding there). <main> keeps 7rem
      // of bottom padding, so the last of the page is never hidden behind it.
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:bottom-0 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:pr-24 lg:hidden print:hidden"
    >
      <InitialsVisual name={name} className="size-12 text-lg sm:size-14 sm:text-xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">
          {name || <span className="font-normal text-muted-foreground">New customer</span>}
        </span>
        {hint || mobile.trim() ? <span className="truncate text-[13px] text-muted-foreground">{hint ?? mobile.trim()}</span> : null}
      </div>
      <SubmitButton pendingLabel="Saving…" aria-disabled={hint ? true : undefined} className={cn("h-14 shrink-0 px-6 text-base", hint && "opacity-60")}>
        {saveLabel}
      </SubmitButton>
    </div>
  );
}
