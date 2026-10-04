import Link from "next/link";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * Shown when a portal detail page's scoped lookup finds nothing.
 *
 * "Doesn't exist" and "belongs to somebody else" land here as the same screen,
 * because the queries filter on the cookie's customer: there is no variant of
 * this page that would tell a stranger their guess was close.
 */
export default function PortalNotFound() {
  return (
    <FriendlyScreen
      picture="/images/home/pickup-bag.webp"
      title="We could not find that"
      body="It is not on your account. It may have been removed, or the link may belong to a different email address."
    >
      <Button asChild size="lg" className={HUGE_BUTTON}>
        <Link href="/portal/home">See your repairs</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
        <Link href="/portal/logout" prefetch={false}>
          Sign in with a different email
        </Link>
      </Button>
    </FriendlyScreen>
  );
}
