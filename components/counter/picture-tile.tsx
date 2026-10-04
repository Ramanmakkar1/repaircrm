import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

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
  className?: string;
};

/**
 * The one tile every Home screen is built from: a picture you recognise at a
 * glance, a plain name, one line of live detail. The whole tile is the tap
 * target (never smaller than 11rem tall).
 */
export function PictureTile({ href, title, detail, photo, alert, mark: Mark, className }: PictureTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full min-h-44 flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative block aspect-[4/3] w-full bg-white">
        <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 220px" className="object-contain p-3" />
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
    </Link>
  );
}
