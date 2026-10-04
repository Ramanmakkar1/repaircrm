import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { REPAIR_STAGES, type RepairStage } from "@/lib/portal-display";

/**
 * Where a repair is, in four stages a customer understands: Received, Fixing,
 * Ready, Done. Four fixed columns instead of the shop's six-step workflow, so
 * the whole tracker (and the current step) always fits a 320px phone with no
 * sideways scroll. The current step is marked three ways: filled bar, bold
 * word and a "Now" label (never colour alone), plus aria-current.
 */
export function RepairStages({ stage, className }: { stage: RepairStage | null; className?: string }) {
  const finished = stage === 3;
  return (
    <ol aria-label="Repair progress" className={cn("grid grid-cols-4 gap-2", className)}>
      {REPAIR_STAGES.map((name, index) => {
        const current = stage === index && !finished;
        const done = stage !== null && (index < stage || finished);
        return (
          <li key={name} aria-current={current ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
            <span aria-hidden className={cn("h-2 rounded-full", done || current ? "bg-accent" : "bg-border")} />
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 text-[13px] leading-tight sm:text-[15px]",
                current ? "font-bold text-foreground" : done ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {done ? <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} /> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
              {done ? <span className="sr-only">(done)</span> : null}
            </span>
            {current ? (
              <span className="w-fit rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-semibold leading-none text-accent-foreground">
                Now
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
