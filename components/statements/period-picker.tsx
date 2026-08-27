"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { PERIOD_PRESETS, presetRange } from "./period";

/**
 * Period selector for a customer statement.
 *
 * The committed range arrives as props from the server page rather than through
 * `useSearchParams`, keeping this component out of that hook's Suspense
 * requirements and leaving the URL as the single source of truth for what the
 * statement below actually covers.
 */
export function StatementPeriodPicker({
  basePath,
  fromValue,
  toValue,
  presetDays,
}: {
  basePath: string;
  fromValue: string;
  toValue: string;
  presetDays: number | null;
}) {
  const router = useRouter();
  const fromRef = React.useRef<HTMLInputElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);

  const navigate = React.useCallback(
    (from: string, to: string) => {
      const params = new URLSearchParams({ from, to });
      router.push(`${basePath}?${params.toString()}`);
    },
    [basePath, router],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_PRESETS.map((preset) => {
          const active = presetDays === preset.days;
          return (
            <button
              key={preset.days}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const range = presetRange(preset.days);
                navigate(range.from, range.to);
              }}
              className={cn(
                "inline-flex h-10 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                  : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate(
            fromRef.current?.value || fromValue,
            toRef.current?.value || toValue,
          );
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="statement-from">From</Label>
          <Input
            id="statement-from"
            key={`from-${fromValue}`}
            ref={fromRef}
            type="date"
            defaultValue={fromValue}
            className="w-[170px]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="statement-to">To</Label>
          <Input
            id="statement-to"
            key={`to-${toValue}`}
            ref={toRef}
            type="date"
            defaultValue={toValue}
            className="w-[170px]"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
    </div>
  );
}
