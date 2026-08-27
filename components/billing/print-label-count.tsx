"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MAX_LABELS, MIN_LABELS } from "@/components/inventory/format";

const PRESETS = [1, 5, 10, 20, 30];

/**
 * How many labels the sheet prints. Rendered inside `PrintToolbar` so the label
 * route wears exactly the same chrome as every other print route rather than a
 * second, differently-styled bar.
 *
 * The count lives in the URL rather than in component state: the sheet itself
 * is server-rendered, so "12 labels" is a real, shareable, re-printable address
 * instead of a state a refresh would forget.
 */
export function PrintLabelCount({
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
    <>
      <span className="rf-toolbar-label">Labels</span>

      <div className="rf-seg">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => apply(preset)}
            aria-pressed={count === preset}
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
          className="rf-count"
          type="number"
          min={MIN_LABELS}
          max={MAX_LABELS}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => apply(Number.parseInt(value, 10))}
        />
      </form>
    </>
  );
}
