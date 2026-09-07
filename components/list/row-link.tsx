"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/components/ui/cn";
import { Tr } from "@/components/ui/table";

/**
 * A table row that navigates on click — the "whole row is the link" half of
 * the list pattern.
 *
 * **This lives here and not in `components/ui/table.tsx`, deliberately.** It
 * is a `"use client"` module. Folding it in beside `Tr` would drag `Table`,
 * `THead`, `TBody`, `Th` and `Td` across the client boundary with it, and
 * every list screen in the app renders those from a server component. The
 * separate file *is* the fix, not a leftover on the way to one.
 *
 * It is deliberately a MOUSE convenience only. The row's first cell always
 * holds a real <Link> (the ticket number, the customer's name, the lead's
 * name), which is what keyboard users tab to, what middle-click opens in a new
 * tab and what "copy link address" copies. Giving the <tr> its own `role=link`
 * and tabIndex on top of that would put two tab stops on every row and
 * announce each record twice.
 *
 * Any click that lands on a nested link, button or menu is left alone, and so
 * is a click that ends a text selection — dragging a phone number out of a row
 * must not navigate away from it.
 *
 * It is the ONE clickable-row component in the app: it used to be two —
 * `components/customers/row-link.tsx` and a near-identical
 * `components/tickets/ticket-row.tsx` — which is exactly the duplication a
 * shared list pattern is supposed to end. It really belongs beside `Tr` in
 * `components/ui/table.tsx`, and should move there.
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
      onMouseEnter={() => router.prefetch(href)}
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
