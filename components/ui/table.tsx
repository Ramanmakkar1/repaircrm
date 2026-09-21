import * as React from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    // `relative`: without a positioned ancestor, an absolutely positioned cell
    // label escaped this scroller and widened the whole page on phones.
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-[13.5px]", className)} {...props} />
    </div>
  );
}

/**
 * A quiet gray band. Inside a white card it is the only fill in the whole
 * table, which is what lets the hairline row dividers stay as light as they
 * are without the columns losing their heading.
 */
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        // the row's own divider is suppressed so the band edge stays one hairline
        "border-b border-border bg-surface-hover [&_tr]:border-0 [&_tr]:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TFoot({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn("border-t border-border bg-surface-hover font-medium", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-surface-hover data-[state=selected]:bg-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}
