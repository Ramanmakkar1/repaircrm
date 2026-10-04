import { Check } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * The pieces of a customer step flow (self check-in, a new repair request):
 * "Step 2 of 4" with a bar, the step's one question in big type, the choices
 * so far as chips, and a bar at the bottom with Back and the one big button.
 * The same shape as the staff New repair flow, sized for a stranger on a phone.
 */

export function StepHeader({
  step,
  total,
  title,
  hint,
  titleRef,
}: {
  /** 0-based. */
  step: number;
  total: number;
  title: string;
  hint?: string;
  /** Focus lands here when the step changes, so a screen reader hears the new question. */
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[14px] font-semibold text-muted-foreground">
          Step {step + 1} of {total}
        </span>
        <span
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          className="flex h-2 flex-1 gap-1"
        >
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={cn("h-2 flex-1 rounded-full", index <= step ? "bg-accent" : "bg-border")} />
          ))}
        </span>
      </div>
      <div>
        <h1 ref={titleRef} tabIndex={-1} className="text-[28px] font-bold leading-tight tracking-tight focus-visible:outline-none">
          {title}
        </h1>
        {hint ? <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** What has been chosen so far ("iPhone", "Cracked screen"), as quiet chips with ticks. */
export function ChoiceChips({ items, className }: { items: string[]; className?: string }) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Your choices so far" className={cn("flex flex-wrap gap-2", className)}>
      {shown.map((item) => (
        <li
          key={item}
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg bg-surface-hover px-3 text-[14px] font-semibold text-foreground"
        >
          <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />
          <span className="truncate">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The bottom bar: Back on the left, the step's one big button on the right,
 * pinned to the bottom of the screen while the step scrolls (a phone, and the
 * counter tablet when a step has more boxes than fit).
 */
export function StepBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-2 flex gap-3 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3",
        "sm:-mx-6 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
