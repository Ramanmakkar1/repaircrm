"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Check, Minus, Plus, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { MAX_LABELS, MIN_LABELS } from "./format";
import { LABEL_SIZES, type LabelSize } from "./label-sizes";

const PRESETS = [1, 5, 10, 20, 30];

const STEP =
  "flex size-12 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * The controls above a sheet of shelf labels, in the app's own look (light,
 * 48px, words): how many, which size, one label per unit for a serialized
 * product, and one big Print button. Everything lives in the address
 * (`?count=&size=&units=`), so the sheet stays server-drawn and "12 small tags"
 * is a link you can print again. Hidden on paper.
 */
export function LabelOptions({
  productName,
  backHref,
  count,
  size,
  units,
  unitCount,
}: {
  productName: string;
  backHref: string;
  count: number;
  size: LabelSize;
  /** Printing one label per unit in stock (serialized products). */
  units: boolean;
  /** How many units are in stock; 0 hides the choice. */
  unitCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const go = (next: { count?: number; size?: LabelSize; units?: boolean }) => {
    const params = new URLSearchParams();
    params.set("count", String(Math.min(MAX_LABELS, Math.max(MIN_LABELS, next.count ?? count))));
    const nextSize = next.size ?? size;
    if (nextSize !== "sheet") params.set("size", nextSize);
    if (next.units ?? units) params.set("units", "1");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="no-print mx-auto my-6 flex w-full max-w-[8.5in] flex-col gap-5 rounded-2xl border border-border bg-surface p-4 text-foreground sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl pr-3 text-base font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-5" />
          Back to the product
        </Link>
        <Button type="button" className="h-14 px-8 text-base [&_svg]:size-5" onClick={() => window.print()}>
          <Printer aria-hidden />
          Print labels
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Shelf labels</h1>
        <p className="text-base text-muted-foreground [overflow-wrap:anywhere]">{productName}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">Label size</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LABEL_SIZES.map((option) => {
            const active = option.key === size;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => go({ size: option.key })}
                className={cn(
                  "relative flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-2 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
                )}
              >
                <span className="text-base font-semibold">{option.label}</span>
                <span className="text-[14px] text-muted-foreground">{option.hint}</span>
                {active ? (
                  <span aria-hidden className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {unitCount > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-semibold">What to print</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: false, label: "The same label, several times", hint: "Price and product code" },
              { value: true, label: `One per unit (${unitCount})`, hint: "Each with its own serial number" },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={units === option.value}
                onClick={() => go({ units: option.value })}
                className={cn(
                  "flex min-h-16 flex-col items-start justify-center rounded-xl border px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  units === option.value ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
                )}
              >
                <span className="text-base font-semibold">{option.label}</span>
                <span className="text-[14px] text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {units && unitCount > 0 ? null : (
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold" id="label-count-label">
            How many labels?
          </span>
          <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby="label-count-label">
            <button type="button" className={STEP} aria-label="One fewer label" disabled={count <= MIN_LABELS || pending} onClick={() => go({ count: count - 1 })}>
              <Minus className="size-5" aria-hidden />
            </button>
            <span className="rf-num w-12 text-center text-2xl font-semibold tabular-nums" aria-live="polite">
              {count}
            </span>
            <button type="button" className={STEP} aria-label="One more label" disabled={count >= MAX_LABELS || pending} onClick={() => go({ count: count + 1 })}>
              <Plus className="size-5" aria-hidden />
            </button>
            <span className="mx-1 h-8 w-px bg-border" aria-hidden />
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={count === preset}
                onClick={() => go({ count: preset })}
                className={cn(
                  "min-h-12 min-w-12 rounded-xl border px-3 text-base font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  count === preset ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-ring",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="text-[14px] text-muted-foreground">Up to {MAX_LABELS} at a time. The preview below is what prints.</p>
        </div>
      )}
    </div>
  );
}
