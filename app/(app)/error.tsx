"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * What a screen falls back to when its render throws.
 *
 * Two things a shop owner can actually do — try again, or go somewhere that
 * works — and no stack trace, because the person reading this is standing at a
 * counter with a customer. The digest is the one technical detail worth
 * showing: it is what a support conversation needs to find the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The server already logged the render failure; this catches the client
    // half, which otherwise only exists in the browser console.
    console.error(error);
  }, [error]);

  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong on this screen"
          hint="Nothing you were working on has been lost. Try loading it again — if it keeps happening, the reference below will tell us where to look."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button onClick={reset}>
                <RotateCw />
                Try again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Back to the dashboard</Link>
              </Button>
            </div>
          }
        />
        {error.digest ? (
          <p className="pb-8 text-center font-mono text-[12.5px] text-faint-foreground">
            Reference {error.digest}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
