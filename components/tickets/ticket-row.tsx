"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tr } from "@/components/ui/table";

/**
 * Makes a whole list row navigable while keeping every cell server-rendered —
 * the cells arrive as `children`, so no ticket data crosses into the client
 * bundle beyond the strings already on screen.
 *
 * The ticket number cell still contains a real <Link>, so middle-click,
 * copy-link and "open in new tab" keep working; this only adds the convenience
 * of clicking anywhere in the row.
 */
export function TicketRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Tr
      role="link"
      tabIndex={0}
      aria-label={`Open ticket ${href.split("/").pop()}`}
      onClick={() => router.push(href)}
      onMouseEnter={() => router.prefetch(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer focus:bg-surface-hover focus:outline-none"
    >
      {children}
    </Tr>
  );
}
