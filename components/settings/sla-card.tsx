"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { MAX_SLA_HOURS, MIN_SLA_HOURS, type SlaHours } from "@/lib/sla";
import { PRIORITIES, PRIORITY_META } from "@/components/tickets/ticket-meta";

/**
 * How long each kind of repair may take before it counts as late.
 *
 * A new repair with no due date typed in gets one this far ahead, and anything
 * that runs past it is flagged as overdue. The hours run around the clock — a
 * customer waiting overnight is still waiting — and the card says so in plain
 * words rather than letting anyone assume opening hours.
 *
 * Controlled: the Devices & repair steps panel owns the values and saves them
 * with its one pinned Save, together with the repair steps.
 */
export const SLA_CHOICES: readonly { hours: number; label: string }[] = [
  { hours: 4, label: "4 hours" },
  { hours: 24, label: "1 day" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

export type SlaDraft = Record<string, string>;

export function slaDraft(sla: SlaHours): SlaDraft {
  return Object.fromEntries(PRIORITIES.map((p) => [p, String(sla[p])]));
}

/** The hours in a draft, or null for any box that is not a whole number in range. */
export function slaFromDraft(draft: SlaDraft): Partial<SlaHours> | null {
  const out: Record<string, number> = {};
  for (const p of PRIORITIES) {
    const hours = Number.parseInt(draft[p] ?? "", 10);
    if (!Number.isFinite(hours) || hours < MIN_SLA_HOURS || hours > MAX_SLA_HOURS) return null;
    out[p] = hours;
  }
  return out as Partial<SlaHours>;
}

export function SlaCard({
  values,
  onChange,
}: {
  values: SlaDraft;
  onChange: (next: SlaDraft) => void;
}) {
  return (
    <Card>
      <CardHeader
        icon={ICONS.dueDate}
        title="How long each repair may take"
        description="A new repair without a due date gets one this far ahead, and is marked late after that. Counted around the clock, nights and weekends included."
      />

      <CardContent className="flex flex-col gap-5">
        {PRIORITIES.map((priority) => {
          const current = Number.parseInt(values[priority] ?? "", 10);
          const id = `sla-${priority}`;
          return (
            <div key={priority} className="flex flex-col gap-2">
              <span id={`${id}-label`} className="text-[15px] font-semibold">
                {PRIORITY_META[priority].label} priority
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
                  {SLA_CHOICES.map((choice) => {
                    const chosen = current === choice.hours;
                    return (
                      <button
                        key={choice.hours}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => onChange({ ...values, [priority]: String(choice.hours) })}
                        className={cn(
                          "inline-flex min-h-12 items-center gap-1.5 rounded-xl border px-3.5 text-[15px] font-semibold transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          chosen ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
                        )}
                      >
                        {chosen ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
                <label htmlFor={id} className="flex items-center gap-2 text-[15px] text-muted-foreground">
                  or
                  <Input
                    id={id}
                    type="number"
                    min={MIN_SLA_HOURS}
                    max={MAX_SLA_HOURS}
                    step={1}
                    inputMode="numeric"
                    aria-label={`${PRIORITY_META[priority].label} priority, in hours`}
                    className="h-12 w-24 text-right text-base tabular-nums"
                    value={values[priority] ?? ""}
                    onChange={(event) => onChange({ ...values, [priority]: event.target.value })}
                  />
                  hours
                </label>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
