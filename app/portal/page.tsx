import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Mail, MailCheck, Phone } from "lucide-react";

import { BrandHeader } from "@/components/public/friendly-screen";
import { LegalLinks, PoweredBy, ShopMark } from "@/components/public/shell";
import { BIG_BUTTON, TOUCH_LINK } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { telHref, type PublicShop } from "@/lib/portal-display";
import { getPortalSession, safeNextPath } from "@/lib/portal-session";
import { PortalSubmit } from "./_components/portal-submit";
import { loadPortalShop, loadPublicShopBySlug } from "./_components/shop";
import { requestPortalLinkAction } from "./actions";

/**
 * The portal's front door. Public: this is the one page below /portal with no
 * session guard.
 *
 * Two ways in:
 *   /portal              → ask for an email, we mail a link
 *   /portal?token=…      → the link itself; handed straight to /portal/verify,
 *                          which is a Route Handler because a render is not
 *                          allowed to set a cookie
 *
 * `?shop=<slug>` (from the shop page or the check-in desk) only changes whose
 * name is shown on top, and only for a shop that is already public.
 *
 * There is no password anywhere in this flow, and no account to create: a repair
 * customer already proved who they are by handing over a laptop and an email
 * address at the counter.
 */

export const metadata = { title: "Check your repair · Repairs helper" };

const ERRORS: Record<string, string> = {
  email: "That does not look like an email address. Check it and try again.",
  expired: "That sign-in link has run out or has been replaced by a newer one. Ask for a fresh one below.",
  invalid: "That sign-in link did not work. Ask for a fresh one below and it will.",
};

/**
 * Shown when the browser still holds a portal cookie whose customer record has
 * since gone (deleted, merged, or moved to another shop). See the guard below
 * for why this case has to be caught here.
 */
const STALE_SESSION_MESSAGE =
  "You were signed out because this account is no longer on file with the shop. Ask for a fresh link below, or call the shop.";

export default async function PortalEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string => (Array.isArray(params[key]) ? (params[key][0] ?? "") : (params[key] ?? ""));

  const next = safeNextPath(first("next"));
  const token = first("token");

  if (token) {
    // Straight through to the Route Handler that can actually set the cookie.
    redirect(`/portal/verify?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  /*
   * A cookie whose signature still verifies is not the same thing as a customer
   * who still exists. `requirePortalCustomer()` re-reads the record and bounces
   * back here when it has gone, so redirecting on the signature alone sends the
   * browser guarded-page → here → guarded-page forever, and the visitor gets
   * ERR_TOO_MANY_REDIRECTS instead of a way back in. The same DB check the guard
   * makes has to happen before we hand the visit on.
   */
  const session = await getPortalSession();
  const live =
    session !== null &&
    (await db.customer.count({
      where: { id: session.customerId, shopId: session.shopId },
    })) > 0;

  if (live) redirect(next ?? "/portal/home");

  const sent = first("sent") === "1";
  const error = session ? STALE_SESSION_MESSAGE : (ERRORS[first("error")] ?? null);

  // Whose repairs: the shop in the link, else the shop of the (stale) cookie.
  const named = first("shop") ? await loadPublicShopBySlug(first("shop")) : null;
  const shop: PublicShop | null = named?.shop ?? (session ? await loadPortalShop(session.shopId) : null);
  const shopParam = named ? named.slug : "";

  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col items-center bg-background px-4 py-8 text-foreground sm:justify-center sm:py-12">
      <div className="flex w-full max-w-md flex-col gap-6">
        {shop ? (
          <div className="flex items-center justify-center gap-3">
            <ShopMark name={shop.name} logoUrl={shop.logoUrl} className="size-12" />
            <span className="min-w-0 truncate text-xl font-bold tracking-tight">{shop.name}</span>
          </div>
        ) : (
          <BrandHeader />
        )}

        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
          {sent ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <MailCheck className="size-14 text-foreground" strokeWidth={1.5} aria-hidden />
              <h1 className="text-[28px] font-bold leading-tight tracking-tight">Now open your email</h1>
              {/* Intentionally says nothing about whether the address matched. */}
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                If the shop has this email address, a sign-in link is on its way. Tap it to see your repairs. It works for the next
                24 hours. Not there? Check your spam folder.
              </p>
              <Link href={shopParam ? `/portal?shop=${shopParam}` : "/portal"} className={TOUCH_LINK}>
                Use a different email address
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-[28px] font-bold leading-tight tracking-tight">Check your repair</h1>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                  See where your device is, answer an estimate or pay a bill. We email you a link, no password needed.
                </p>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-[15px] leading-relaxed text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </p>
              ) : null}

              <form action={requestPortalLinkAction} className="flex flex-col gap-4">
                {next ? <input type="hidden" name="next" value={next} /> : null}
                {shopParam ? <input type="hidden" name="shop" value={shopParam} /> : null}

                <div className="flex flex-col gap-2">
                  <label htmlFor="portal-email" className="text-[15px] font-semibold">
                    Your email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" aria-hidden />
                    <Input
                      id="portal-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      className="h-14 rounded-xl pl-12 pr-4 text-base"
                    />
                  </div>
                  <p className="text-[14px] text-muted-foreground">The one you gave the shop when you dropped your device off.</p>
                </div>

                <PortalSubmit pendingLabel="Sending your link…">Email me a sign-in link</PortalSubmit>
              </form>
            </>
          )}
        </section>

        {/* Only gave a phone number at the counter: say what to do instead. */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold">Only gave the shop your phone number?</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {named?.statusLookup
              ? "Use your repair number instead, or call the shop and they will add your email."
              : "Call the shop and they will add your email, or tell you how your repair is going."}
          </p>
          {named?.statusLookup ? (
            <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
              <Link href={`/s/${named.slug}#status`}>Check with my repair number</Link>
            </Button>
          ) : null}
          {shop?.phone ? (
            <Button asChild size="lg" variant="outline" className={cn(BIG_BUTTON, "sm:w-full")}>
              <a href={telHref(shop.phone)}>
                <Phone aria-hidden />
                Call {shop.phone}
              </a>
            </Button>
          ) : null}
        </section>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[15px] text-muted-foreground">
            Shop staff?{" "}
            <Link href="/login" className={cn(TOUCH_LINK, "underline")}>
              Sign in here
            </Link>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4">
            <LegalLinks />
            <PoweredBy />
          </div>
        </div>
      </div>
    </div>
  );
}
