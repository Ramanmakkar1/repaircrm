"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { screenName, workspaceBack } from "@/lib/touch-workspace";
import { Button } from "@/components/ui/button";
import { backTarget, readTrail, recordVisit, subscribeTrail } from "./back-trail";

/** Records each screen (with its filters) as the person moves around. Renders nothing. */
export function BackTrailRecorder() {
  const path = usePathname();
  const search = useSearchParams();
  const query = search?.toString() ?? "";
  React.useEffect(() => {
    recordVisit(query ? `${path}?${query}` : path);
  }, [path, query]);
  return null;
}

/** Where Back goes from this screen: the last screen in this visit, else the one above it. */
export function useBackHref(path: string): string {
  return React.useSyncExternalStore(
    subscribeTrail,
    () => backTarget(readTrail(), path),
    // The server has no trail: render the parent, then switch once the trail is read.
    () => workspaceBack(path),
  );
}

/**
 * The shell's Back and Home. Back says where it goes ("Back to Repairs") and
 * goes there with the list's filters intact. When Back would only go Home,
 * there is one Home button instead of two buttons doing the same job.
 */
export function BackHomeControls({ path }: { path: string }) {
  const href = useBackHref(path);
  const name = screenName(href);
  const backIsHome = href === "/counter";
  return (
    <>
      <Button
        variant="outline"
        asChild
        className={backIsHome ? "min-h-12 min-w-12 px-3 sm:hidden" : "min-h-12 min-w-12 px-3 sm:px-4"}
      >
        <Link href={href} aria-label={`Back to ${name}`} data-touch-control>
          <ArrowLeft aria-hidden className="size-5" />
          <span aria-hidden className="hidden sm:inline md:hidden">Back</span>
          <span aria-hidden className="hidden max-w-[14rem] truncate md:inline">Back to {name}</span>
        </Link>
      </Button>
      <Button
        variant={backIsHome ? "outline" : "ghost"}
        asChild
        className="hidden min-h-12 px-4 sm:inline-flex"
      >
        <Link href="/counter" data-touch-control>
          <Home aria-hidden className="size-5" />
          Home
        </Link>
      </Button>
    </>
  );
}
