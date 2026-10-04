import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "./cn";

/**
 * The calm "nothing here yet" moment: a picture you recognise, one plain
 * sentence, one line saying what to do, and at most ONE big button.
 *
 *   <EmptyState
 *     photo="/images/home/pickup-bag.webp"
 *     title="Nothing ready for pickup"
 *     hint="Repairs marked Ready show up here."
 *     actionLabel="See all repairs"
 *     actionHref="/tickets"
 *   />
 *
 * Use a photo from public/images/home or public/images/products (the same
 * ones the Home tiles use). `icon` still works for older callers and small
 * panels; `action` still takes any node, but one primary action is the rule.
 */
export function EmptyState({
  icon: Icon,
  photo,
  title,
  hint,
  action,
  actionLabel,
  actionHref,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  /** A picture under /public, shown at about 112px on its white canvas. */
  photo?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  /** The one next step, drawn as the big black button. Needs `actionHref`. */
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {photo ? (
        <span className="relative mb-1 block size-28 overflow-hidden rounded-2xl bg-white">
          <Image src={photo} alt="" fill sizes="112px" className="object-contain p-2.5" />
        </span>
      ) : Icon ? (
        <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-surface-hover text-muted-foreground">
          <Icon className="size-7" />
        </span>
      ) : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
          {title}
        </p>
        {hint ? (
          <p className="text-[15px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          data-touch-control
          className="mt-1 inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-6 text-[15px] font-semibold text-accent-foreground shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {actionLabel}
        </Link>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
