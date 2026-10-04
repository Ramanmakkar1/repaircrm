"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";

import "./globals.css";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * The last line: the root layout itself failed. This replaces the whole
 * document, so it brings its own <html>, <body> and stylesheet; the theme
 * follows the device (light or dark), because the saved theme lives in the
 * layout that just failed.
 *
 * Plain anchors rather than client navigation: with the root layout broken, a
 * full page load is the only reliable way back.
 */
export default function GlobalError({
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

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Repairs helper</title>
        <FriendlyScreen
          picture="/images/products/repair-tools.webp"
          title="Something went wrong"
          body="Repairs helper could not open this page. Nothing you saved has been lost. Try again in a moment."
          header={null}
          footer={
            error.digest ? (
              <p className="text-center font-mono text-[13px] text-muted-foreground">Reference {error.digest}</p>
            ) : null
          }
        >
          <Button type="button" size="lg" className={HUGE_BUTTON} onClick={() => (retry ?? reset)?.()}>
            <RotateCw aria-hidden />
            Try again
          </Button>
          <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Go to the home page</a>
          </Button>
        </FriendlyScreen>
      </body>
    </html>
  );
}
