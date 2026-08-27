"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { MAX_LABELS, MIN_LABELS } from "./format";

const PRESETS = [1, 5, 10, 20, 30];

/**
 * The only interactive chrome on the label sheet. It carries `no-print`, so
 * `@media print` removes it and the paper holds nothing but labels.
 *
 * The count lives in the URL rather than in component state: the sheet itself
 * is server-rendered, so "12 labels" is a real, shareable, re-printable address
 * instead of a state a refresh would forget.
 *
 * Styling here is deliberately hard-coded light neutrals, matching the other
 * print routes — a print sheet is paper, not a themed app surface.
 */
export function LabelToolbar({
  productId,
  count,
}: {
  productId: string;
  count: number;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(String(count));

  // Re-sync when the count changes from a preset button or the back button.
  // Adjusted during render, not in an effect, so the stale value is never
  // committed to the DOM.
  const [lastCount, setLastCount] = React.useState(count);
  if (lastCount !== count) {
    setLastCount(count);
    setValue(String(count));
  }

  const apply = (next: number) => {
    const clamped = Math.min(MAX_LABELS, Math.max(MIN_LABELS, next));
    setValue(String(clamped));
    router.replace(`/print/labels/${productId}?count=${clamped}`, {
      scroll: false,
    });
  };

  return (
    <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
      <Link
        href={`/inventory/${productId}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" />
        Back to product
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-neutral-600">Labels</span>

        <div className="flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => apply(preset)}
              aria-pressed={count === preset}
              className={
                count === preset
                  ? "h-8 border-r border-neutral-300 bg-neutral-900 px-3 text-[13px] font-semibold text-white last:border-r-0"
                  : "h-8 border-r border-neutral-300 px-3 text-[13px] font-medium text-neutral-600 last:border-r-0 hover:bg-neutral-100"
              }
            >
              {preset}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply(Number.parseInt(value, 10));
          }}
        >
          <label className="sr-only" htmlFor="label-count">
            Number of labels
          </label>
          <input
            id="label-count"
            type="number"
            min={MIN_LABELS}
            max={MAX_LABELS}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => apply(Number.parseInt(value, 10))}
            className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-center text-[13px] font-medium text-neutral-900 tabular-nums outline-none focus:border-neutral-900"
          />
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-[13px] font-medium text-white transition-colors hover:bg-neutral-700"
        >
          <Printer className="size-4" />
          Print
        </button>
      </div>
    </div>
  );
}
