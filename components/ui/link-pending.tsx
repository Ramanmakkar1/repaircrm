"use client";

import * as NextLink from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type LinkStatus = () => { pending: boolean };

/*
 * `useLinkStatus` is read once, defensively: a unit test that mocks next/link
 * with only a default export must still be able to render a tile.
 */
let useStatus: LinkStatus = () => ({ pending: false });
try {
  const hook = (NextLink as unknown as { useLinkStatus?: LinkStatus }).useLinkStatus;
  if (typeof hook === "function") useStatus = hook;
} catch {
  // A mocked next/link without the hook: tiles simply show no pending state.
}

/**
 * Put inside a `<Link>` (whose class list includes `relative`): while that
 * link's screen is loading, the tile dims a little and shows a spinner, so a
 * tap on a tile always visibly "took". Fixed size and absolutely placed, so
 * it never shifts the layout.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? "true" : undefined}
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/50 opacity-0 transition-opacity duration-150 data-[pending=true]:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      {pending ? <Loader2 className="size-7 animate-spin text-foreground" /> : null}
    </span>
  );
}
