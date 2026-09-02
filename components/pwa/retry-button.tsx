"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Try again" on the offline page.
 *
 * `location.reload()` rather than a router navigation: the router would ask the
 * service worker for the same route and get the same cached offline page back.
 * A full reload re-runs the navigation request, which is the only thing that
 * can tell whether the network came back.
 */
export function RetryButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.location.reload()}
    >
      <RotateCw />
      Try again
    </Button>
  );
}
