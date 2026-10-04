import Image from "next/image";

import { cn } from "@/components/ui/cn";

/**
 * The real Repairs helper badge (public/brand/helper-badge.webp), with explicit
 * dimensions so the page does not shift while it loads. The navbar logo sits at
 * the very top of the page, so it is loaded eagerly there (`priority`).
 */
export function BrandMark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/helper-badge.webp"
      alt=""
      width={96}
      height={96}
      sizes="64px"
      priority={priority}
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
