"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Copy, Home, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What a screen falls back to when its render throws.
 *
 * Calm, and two things a person can actually do: try again, or go Home. No
 * stack trace, because the person reading this is standing at a counter with
 * a customer. The error code is the one technical detail worth showing (it is
 * what support needs to find the server log), and it copies with one tap.
 * The shell (Back, Home, Search) stays around it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    // The server already logged the render failure; this catches the client
    // half, which otherwise only exists in the browser console.
    console.error(error);
  }, [error]);

  async function copy() {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard (an old browser, a blocked permission): the code is still on screen to read out.
    }
  }

  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-10 text-center sm:py-12">
      <span className="relative block size-32 overflow-hidden rounded-2xl bg-white">
        <Image src="/images/home/toolbox.webp" alt="" fill sizes="128px" className="object-contain p-3" priority />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-semibold tracking-tight">That screen didn&rsquo;t load</h1>
        <p className="text-[16px] leading-snug text-muted-foreground">
          Nothing you saved is lost. Try again; if it keeps happening, go Home and carry on, and tell whoever looks after the app.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
        <Button onClick={reset} size="lg" className="min-h-14 px-8 text-[16px]">
          <RotateCw aria-hidden />
          Try again
        </Button>
        <Button variant="outline" size="lg" asChild className="min-h-14 px-8 text-[16px]">
          <Link href="/counter">
            <Home aria-hidden />
            Go Home
          </Link>
        </Button>
      </div>
      {error.digest ? (
        <button
          type="button"
          onClick={copy}
          className="flex min-h-12 items-center gap-2 rounded-full border border-border px-4 text-[14px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "Copied" : "Copy error code"}
          <span className="font-mono text-[13px]">{error.digest}</span>
        </button>
      ) : null}
    </div>
  );
}
