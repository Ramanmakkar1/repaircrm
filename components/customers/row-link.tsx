"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/components/ui/cn";
import { Tr } from "@/components/ui/table";

/**
 * A table row that navigates on click.
 *
 * The row itself handles pointer clicks; the real <Link> lives in the name cell
 * so keyboard users, middle-click and "copy link address" all still work. Any
 * click that lands on a nested link or button is left alone.
 */
export function RowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Tr
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, [role='menu']")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </Tr>
  );
}
