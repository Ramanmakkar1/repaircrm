import Link from "next/link";
import { Phone } from "lucide-react";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { ShopMark } from "@/components/public/shell";
import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { db } from "@/lib/db";
import { linkExpiredWords, telHref } from "@/lib/portal-display";
import { getPortalSession } from "@/lib/portal-session";
import { loadPortalShop } from "../_components/shop";

export const metadata = {
  title: "This link has expired · Repairs helper",
  robots: { index: false, follow: false },
};

/**
 * Where a dead "View your invoice" or "View your estimate" link lands
 * (/portal/i/<token>, /portal/e/<token>): words about THAT document, not the
 * generic "we couldn't read that sign-in link".
 *
 * The token itself tells us nothing (a bad token and a draft land here the
 * same way, on purpose). The shop's Call button appears only when this browser
 * already holds a portal cookie, whose shop is the only one we may name.
 */
export default async function LinkExpiredPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const doc = (Array.isArray(params.doc) ? params.doc[0] : params.doc) ?? "";
  const words = linkExpiredWords(doc);

  const session = await getPortalSession();
  const signedIn =
    session !== null && (await db.customer.count({ where: { id: session.customerId, shopId: session.shopId } })) > 0;
  const shop = session ? await loadPortalShop(session.shopId) : null;

  return (
    <FriendlyScreen
      picture={words.picture}
      title={words.title}
      body={shop ? words.body.replace("the shop", shop.name) : words.body}
      header={
        shop ? (
          <div className="mx-auto flex min-h-12 items-center gap-3">
            <ShopMark name={shop.name} logoUrl={shop.logoUrl} />
            <span className="text-xl font-bold tracking-tight">{shop.name}</span>
          </div>
        ) : undefined
      }
    >
      {shop?.phone ? (
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <a href={telHref(shop.phone)}>
            <Phone aria-hidden />
            Call {shop.phone} for a new link
          </a>
        </Button>
      ) : null}
      {signedIn ? (
        <Button asChild size="lg" variant={shop?.phone ? "outline" : "default"} className={shop?.phone ? cn(BIG_BUTTON, "sm:w-full") : HUGE_BUTTON}>
          <Link href="/portal/home">See all your repairs and bills</Link>
        </Button>
      ) : (
        <Button asChild size="lg" variant={shop?.phone ? "outline" : "default"} className={shop?.phone ? cn(BIG_BUTTON, "sm:w-full") : HUGE_BUTTON}>
          <Link href="/portal">Sign in with your email instead</Link>
        </Button>
      )}
    </FriendlyScreen>
  );
}
