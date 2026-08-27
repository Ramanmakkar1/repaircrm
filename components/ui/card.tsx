import * as React from "react";
import { cn } from "./cn";

/**
 * The box everything in RepairFlow lives in.
 *
 * The card is white on a white canvas, so its edge comes from a crisp hairline
 * border and its depth from a pair of very soft shadow layers — never from a
 * tinted fill. 20px padding and a 16px corner keep it a friendly panel a
 * non-technical employee can scan, rather than a spreadsheet cell.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-base font-bold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[13.5px] text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * 20px on every side, which is deliberately the same `p-5` the hand-rolled
 * cards elsewhere in the app use — so a Card and a plain bordered div sitting
 * side by side in a grid share one rhythm.
 */
export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}
