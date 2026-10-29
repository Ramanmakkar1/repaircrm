import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { PublicSite } from "@/components/public/public-site";
import { HUGE_BUTTON, BIG_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = {
  title: "Page not found · Repairs helper",
};

/**
 * Every link that goes nowhere: a mistyped address, an old window sticker, a
 * shop page or check-in desk that is not switched on (those call notFound() so
 * an unused shop link reads exactly like one that never existed).
 *
 * Home is the first way out; customers hunting for a repair get the portal and
 * staff get Sign in. The mascot is the small transparent master served as is
 * (no /_next/image round trip) and preloaded, because it is the largest thing
 * on the screen.
 */
export default function NotFound() {
  return (
    <PublicSite>
      <FriendlyScreen
        header={null}
        className="min-h-0 flex-none px-4 py-10 sm:py-16"
        art={
          <Image
            src="/brand/husky-mark-blue.webp"
            alt=""
            width={256}
            height={256}
            unoptimized
            preload
            className="size-32"
          />
        }
        title="We can't find that page"
        body="The link may be old or have a typo in it. Pick where you want to go."
      >
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
          <Link href="/portal">Check your repair</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
          <Link href="/login">Shop staff: sign in</Link>
        </Button>
      </FriendlyScreen>
    </PublicSite>
  );
}
