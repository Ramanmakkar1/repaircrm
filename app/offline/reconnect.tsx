"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";

import { HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";

/**
 * "Try again", and the same thing on its own the moment the connection comes
 * back (the browser's `online` event), so nobody has to keep tapping.
 *
 * A full reload rather than a router navigation: the router would ask the
 * service worker for the same route and get this cached page back. Only a real
 * navigation can tell whether the network returned.
 */
export function Reconnect() {
  React.useEffect(() => {
    const back = () => window.location.reload();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  return (
    <Button type="button" size="lg" className={HUGE_BUTTON} onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      Try again
    </Button>
  );
}
