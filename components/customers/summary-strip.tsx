import * as React from "react";

import { cn } from "@/components/ui/cn";
import type { SummaryItem, SummaryTone } from "./customer-screen";

const VALUE_TONE: Record<SummaryTone, string> = {
  alert: "text-status-overdue-fg",
  good: "text-status-resolved-fg",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
};

/**
 * The strip under the customer header: open repairs, what they owe, store
 * credit and the last visit, each as a plain label and a short phrase
 * ("$27.05 owed", "Nothing owed"). One panel with four label/value pairs and no
 * cards inside it.
 *
 * Four across from a landscape tablet (lg) up, two by two on a portrait tablet
 * (four 170px columns at 768px broke "$746.14 owed" and "Customer since Jun 18,
 * 2026" over two lines each). On a phone the strip is kept short, because the
 * header and this panel are the whole first screen and the sections start right
 * under them: repairs, owed and last visit share one row of small figures, and
 * store credit gets a row of its own with the "Add credit" button beside the
 * amount (not under it).
 *
 * `creditAction` is the "Add credit" control, which belongs to the store-credit
 * pair (staff only: the page passes nothing for a technician).
 */
export function SummaryStrip({ items, creditAction }: { items: SummaryItem[]; creditAction?: React.ReactNode }) {
  return (
    <dl
      aria-label="Summary"
      className={cn(
        "grid grid-cols-3 gap-x-2 gap-y-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 sm:p-5 lg:gap-x-4",
        // The store-credit pair is wider when it carries the "Add credit" button, so the button sits beside the amount.
        creditAction ? "lg:grid-cols-[1fr_1fr_1.6fr_1.15fr]" : "lg:grid-cols-4",
      )}
    >
      {items.map((item) => {
        const credit = item.key === "credit";

        return (
          <div
            key={item.key}
            className={cn(
              "min-w-0",
              // Phone: the credit pair is the last row, as wide as the panel. Its label and amount sit on the left and the
              // button on the right, centred on both. Tablet up: label above, amount and button side by side (the button
              // drops under the amount when the column is narrow).
              credit
                ? "max-sm:order-last max-sm:col-span-3 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-3 sm:flex sm:flex-wrap sm:content-start sm:items-center sm:gap-x-3 sm:gap-y-0.5"
                : "flex flex-col gap-0.5",
            )}
          >
            <dt className={cn("text-xs text-muted-foreground sm:text-sm", credit && "col-start-1 sm:basis-full")}>{item.label}</dt>
            {/* A 48px row when the "Add credit" button is there, so every amount in the strip lines up with it. */}
            <dd className={cn("flex items-center", creditAction && "sm:min-h-12", credit && "col-start-1")}>
              <span className={cn("rf-num text-[15px] font-semibold leading-snug sm:text-xl", VALUE_TONE[item.tone])}>{item.value}</span>
            </dd>
            {credit && creditAction ? <dd className="col-start-2 row-span-2 row-start-1 justify-self-end sm:justify-self-auto">{creditAction}</dd> : null}
            {item.detail ? <dd className="text-xs text-muted-foreground sm:text-sm">{item.detail}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
