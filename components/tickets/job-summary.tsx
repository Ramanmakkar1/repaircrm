import * as React from "react";

import { cn } from "@/components/ui/cn";

export type JobFact = {
  label: string;
  value: React.ReactNode;
  /** A long value (the device and its serial): a whole row of its own on a phone, label above, value below, even in the side panel. */
  wide?: boolean;
};

/**
 * The facts people ask for at the counter, in one small box: which device,
 * who has it, when it is due, where it is, when it was last touched.
 *
 * Each value is the control the repair page has always had for it (the assignee
 * picker, the due date, the location picker), so a fact that can be changed is
 * changed right here. Nothing scrolls sideways: a two-column grid on a phone (the
 * device, which can be long, takes a whole row and wraps), four across on a
 * tablet held upright, one tall column in the side panel.
 */
export function JobSummary({ facts }: { facts: JobFact[] }) {
  return (
    <section aria-label="At a glance" className="overflow-hidden rounded-2xl border border-border bg-surface lg:order-3">
      {/* The 1px gaps over the border colour are the dividers, so a row or a column can start anywhere. */}
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:flex lg:flex-col">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className={cn(
              "flex min-h-14 min-w-0 flex-col justify-start gap-1 bg-surface px-4 py-2 lg:justify-center",
              fact.wide ? "col-span-full" : "lg:flex-row lg:items-center lg:justify-between lg:gap-3",
            )}
          >
            <dt className="shrink-0 truncate text-sm text-muted-foreground">{fact.label}</dt>
            <dd className={cn("min-w-0 break-words text-base text-foreground", !fact.wide && "lg:text-right")}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
