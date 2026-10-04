import * as React from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";

import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

/**
 * The owner's answer for one connection, in the order an owner asks:
 * what is it (a picture and a name), is it working (one word), what does that
 * mean (one line) and what do I press (one button). Used at the top of the
 * panels that used to open on developer configuration.
 */
export function StatusTile({
  photo,
  icon: Icon,
  title,
  state,
  tone,
  detail,
  children,
  className,
}: {
  /** A picture from /public/images, shot on white. */
  photo?: string;
  /** When there is no picture. */
  icon?: LucideIcon;
  title: string;
  /** The one word or two: "Sending", "Not set up yet". */
  state: string;
  tone: StatusTone;
  detail: React.ReactNode;
  /** The next step: one button (or two at most). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-start sm:gap-4", className)}
    >
      {photo ? (
        <span className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={photo} alt="" fill sizes="80px" className="object-contain p-2" />
        </span>
      ) : Icon ? (
        <span aria-hidden className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-foreground">
          <Icon className="size-8" strokeWidth={1.6} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold leading-tight text-foreground">{title}</h3>
          <StatusPill tone={tone} label={state} className="text-[13px]" />
        </div>
        <div className="text-[15px] leading-snug text-muted-foreground">{detail}</div>
        {children ? <div className="mt-1 flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </section>
  );
}
