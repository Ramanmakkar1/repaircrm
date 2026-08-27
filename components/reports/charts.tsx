import * as React from "react";

import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";

/**
 * The report charts.
 *
 * No charting library, on purpose: every shape on this page is "a number as a
 * proportion of the biggest number", which is a div with a percentage on it.
 * A library would add a client bundle, a canvas the browser cannot select text
 * out of, and its own colour system to fight with the design tokens.
 *
 * These are Server Components — they ship zero JavaScript.
 *
 * ACCESSIBILITY
 * The bars themselves are `aria-hidden`: a screen reader gets nothing useful
 * from a stack of empty divs. Every chart instead exposes the same numbers as
 * a real `<table>` inside a `<details>`, which is native, keyboard-operable,
 * and — unlike a visually-hidden table — also serves the sighted operator who
 * wants the exact figure rather than the shape.
 */

export type Series = {
  key: string;
  label: string;
  /** A token background class, e.g. "bg-accent" or "bg-status-resolved". */
  className: string;
};

/**
 * "$1.2k" / "$840" — axis labels only.
 *
 * A column chart cannot afford "$1,284.50" thirteen times across, and the
 * rounding does not matter there because the exact figure is one click away in
 * the data table underneath. Never use this where a real amount is expected.
 */
export function compactCents(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars}`;
}

export type ColumnRow = {
  label: string;
  fullLabel: string;
  values: number[];
};

export function ColumnChart({
  caption,
  series,
  rows,
  format,
  showValues = false,
  className,
}: {
  /** Names the chart for assistive tech and titles the data table. */
  caption: string;
  series: Series[];
  rows: ColumnRow[];
  format: (value: number) => string;
  showValues?: boolean;
  className?: string;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => row.values.map((value) => Math.max(0, value))),
  );
  const empty = rows.every((row) => row.values.every((value) => value <= 0));

  return (
    <figure className={cn("flex flex-col gap-3", className)} aria-label={caption}>
      <div
        aria-hidden="true"
        className="flex h-44 items-end gap-1.5 sm:gap-2.5"
      >
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col gap-2">
            {showValues ? (
              <div className="flex justify-center gap-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {format(row.values[0])}
              </div>
            ) : null}
            <div className="flex flex-1 items-end justify-center gap-[3px]">
              {row.values.map((value, index) => (
                <div
                  key={series[index].key}
                  className="flex h-full w-full items-end"
                >
                  <div
                    className={cn(
                      "w-full rounded-t-xs transition-[height]",
                      series[index].className,
                      value > 0 ? "min-h-[3px]" : "min-h-0",
                    )}
                    style={{
                      height: `${value > 0 ? Math.max(2, (value / max) * 100) : 0}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="truncate text-center text-[11.5px] font-medium text-muted-foreground">
              {row.label}
            </span>
          </div>
        ))}
      </div>

      {empty ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing recorded in this period yet.
        </p>
      ) : null}

      {series.length > 1 ? <Legend series={series} /> : null}

      <ChartTable
        caption={caption}
        columns={series.map((item) => item.label)}
        rows={rows.map((row) => ({
          header: row.fullLabel,
          cells: row.values.map(format),
        }))}
      />
    </figure>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground"
        >
          <span className={cn("size-2.5 shrink-0 rounded-xs", item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type BarItem = {
  label: string;
  value: number;
  /** Right-hand text — already formatted. */
  display: string;
  /** Small grey note under the label, e.g. "3 payments". */
  hint?: string;
  className?: string;
};

/**
 * Horizontal bars for ranked lists (payment methods, top products).
 * The value is written next to every bar, so this needs no data table.
 */
export function BarList({
  items,
  className,
  barClassName = "bg-accent",
}: {
  items: BarItem[];
  className?: string;
  barClassName?: string;
}) {
  const max = Math.max(1, ...items.map((item) => Math.max(0, item.value)));

  return (
    <ul className={cn("flex flex-col gap-3.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[14px] font-semibold text-foreground">
              {item.label}
            </span>
            <span className="shrink-0 text-[14px] font-bold tabular-nums text-foreground">
              {item.display}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
            role="img"
            aria-label={`${item.label}: ${item.display}`}
          >
            <div
              className={cn("h-full rounded-full", item.className ?? barClassName)}
              style={{
                width: `${item.value > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`,
              }}
            />
          </div>
          {item.hint ? (
            <span className="text-[12.5px] text-muted-foreground">{item.hint}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** A pair of proportional bars — "raised vs paid", "created vs resolved". */
export function CompareBars({
  items,
}: {
  items: { label: string; value: number; display: string; className: string }[];
}) {
  const max = Math.max(1, ...items.map((item) => Math.max(0, item.value)));

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold text-muted-foreground">
              {item.label}
            </span>
            <span className="text-[22px] font-bold leading-none tabular-nums text-foreground">
              {item.display}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-hover"
            role="img"
            aria-label={`${item.label}: ${item.display}`}
          >
            <div
              className={cn("h-full rounded-full", item.className)}
              style={{
                width: `${item.value > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The `<details>` data table every column chart carries. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { header: string; cells: string[] }[];
}) {
  return (
    <details className="group -mx-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 py-1 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <span
          aria-hidden="true"
          className="transition-transform group-open:rotate-90"
        >
          ›
        </span>
        Show the numbers
      </summary>
      <div className="mt-2 rounded-md border border-border">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <THead>
            <Tr>
              <Th>Period</Th>
              {columns.map((column) => (
                <Th key={column} className="text-right">
                  {column}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.header}>
                <Td className="font-medium text-muted-foreground">{row.header}</Td>
                {row.cells.map((cell, index) => (
                  <Td
                    key={columns[index]}
                    className="text-right font-semibold tabular-nums"
                  >
                    {cell}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </details>
  );
}
