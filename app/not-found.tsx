import Link from "next/link";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { HUGE_BUTTON, BIG_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * Every link that goes nowhere: a mistyped address, an old window sticker, a
 * shop page or check-in desk that is not switched on (those call notFound() so
 * an unused shop link reads exactly like one that never existed).
 *
 * Most people who land here are customers, so the first way out is checking a
 * repair; staff get Home (which takes a signed-in person to their own home)
 * and Sign in.
 */
export default function NotFound() {
  return (
    <FriendlyScreen
      picture="/images/home/display-screen.webp"
      title="We can't find that page"
      body="The link may be old or have a typo in it. Pick where you want to go."
    >
      <Button asChild size="lg" className={HUGE_BUTTON}>
        <Link href="/portal">Check your repair</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
        <Link href="/">Go to the home page</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
        <Link href="/login">Shop staff: sign in</Link>
      </Button>
    </FriendlyScreen>
  );
}
