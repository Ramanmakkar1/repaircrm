import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { LinkPending } from "@/components/ui/link-pending";

export type PictureTileProps = {
  href: string;
  title: string;
  detail?: string;
  /** Path under /public. Product photos sit on white, so the picture area is white in every theme. */
  photo: string;
  /** Count to flag, with its word ("2 ready"), so it never relies on colour alone. */
  alert?: string;
  /** Small round mark over the picture to tell look-alike tiles apart (add vs find). */
  mark?: LucideIcon;
  /** false for the long tail, so Home does not fetch thirty screens nobody is about to open. */
  prefetch?: boolean;
  className?: string;
};

/**
 * The one tile every Home screen is built from: a picture you recognise at a
 * glance, a plain name, one line of live detail. The whole tile is the tap
 * target (never smaller than 11rem tall).
 */
export function PictureTile({ href, title, detail, photo, alert, mark: Mark, prefetch, className }: PictureTileProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch === false ? false : undefined}
      className={cn(
        "group relative flex h-full min-h-44 flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative block aspect-[4/3] w-full bg-white">
        {/*
          `unoptimized`: the tile photos are already 768px WebPs of 15-85 KB, so
          resizing them buys little, and Next 16.3's optimizer wedges a URL for
          the life of the server once one request for it is aborted mid-resize
          (a tap away from Home while tiles load): every later request for that
          width hangs and the tile stays blank. Served as-is, they cannot.
        */}
        <Image src={photo} alt="" fill unoptimized className="object-contain p-3" />
        {Mark ? (
          <span className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
            <Mark className="size-5" aria-hidden />
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <span className="text-base font-semibold leading-tight sm:text-lg">{title}</span>
        {detail ? <span className="text-[13px] leading-snug text-muted-foreground sm:text-sm">{detail}</span> : null}
      </span>
      {alert ? (
        <span className="absolute left-3 top-3 rounded-full bg-destructive px-2.5 py-0.5 text-sm font-semibold text-destructive-foreground">{alert}</span>
      ) : null}
      {/* A tap always shows it took, even while the next screen is still on its way. */}
      <LinkPending />
    </Link>
  );
}
