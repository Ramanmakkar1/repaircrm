import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { RepairPilotMark, RepairPilotWordmark } from "@/components/brand/repairpilot";
import { cn } from "@/components/ui/cn";

/**
 * The screen for "that did not work": a page that is not there, a link that ran
 * out, a crash, no internet. One picture, one plain sentence, and big ways out,
 * the same calm card everywhere so a dead end never looks like a broken site.
 *
 * No hooks, no server-only imports: the error boundaries (client components)
 * use it as well as the server-rendered not-found pages.
 */
export function FriendlyScreen({
  picture,
  icon: Icon,
  title,
  body,
  children,
  header,
  footer,
  className,
}: {
  /** A photo from /public/images, shot on white. */
  picture?: string;
  /** Used when there is no picture (the offline page cannot load one). */
  icon?: LucideIcon;
  title: string;
  body: React.ReactNode;
  /** The ways out: big buttons, the first one black. */
  children?: React.ReactNode;
  /** Above the card. Default: the Repairs helper mark, linking home. */
  header?: React.ReactNode;
  /** Under the card: a reference number, a quiet extra link. */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-dvh w-full flex-1 flex-col items-center justify-center bg-background px-4 py-10 text-foreground", className)}>
      <div className="flex w-full max-w-md flex-col gap-6">
        {header === undefined ? <BrandHeader /> : header}

        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {picture ? (
            <div className="relative aspect-[16/9] w-full bg-white">
              <Image src={picture} alt="" fill sizes="(max-width: 480px) 100vw, 448px" className="object-contain p-5" priority />
            </div>
          ) : Icon ? (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-surface-hover text-foreground">
              <Icon aria-hidden className="size-16" strokeWidth={1.5} />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 px-6 pt-6 text-center">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">{title}</h1>
            <div className="text-[15px] leading-relaxed text-muted-foreground">{body}</div>
          </div>

          {children ? <div className="flex flex-col gap-3 p-6">{children}</div> : <div className="pb-6" />}
        </section>

        {footer}
      </div>
    </div>
  );
}

/** The Repairs helper mark, for screens that do not belong to one shop. */
export function BrandHeader({ link = true }: { link?: boolean }) {
  const inner = (
    <>
      <RepairPilotMark className="size-10" />
      <RepairPilotWordmark className="text-xl" />
    </>
  );
  return link ? (
    <Link
      href="/"
      className="mx-auto flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </Link>
  ) : (
    <div className="mx-auto flex min-h-12 items-center gap-2.5 px-2 text-foreground">{inner}</div>
  );
}
