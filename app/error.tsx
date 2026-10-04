"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * A crash anywhere outside the signed-in app (which has its own, see
 * app/(app)/error.tsx): the customer portal, check-in, sign-in, the shop page.
 *
 * Plain words and two ways out. The reference number is the one technical
 * detail worth showing: it is what finds the server log.
 */
export default function RootError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  const again = () => (retry ?? reset)?.();

  return (
    <FriendlyScreen
      picture="/images/products/repair-tools.webp"
      title="Something went wrong"
      body="This page did not load properly. Nothing you saved has been lost. Try again, and if it keeps happening, call the shop."
      footer={
        error.digest ? (
          <p className="text-center font-mono text-[13px] text-muted-foreground">Reference {error.digest}</p>
        ) : null
      }
    >
      <Button type="button" size="lg" className={HUGE_BUTTON} onClick={again}>
        <RotateCw aria-hidden />
        Try again
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
        <Link href="/">Go to the home page</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
        <Link href="/portal">Check your repair</Link>
      </Button>
    </FriendlyScreen>
  );
}
