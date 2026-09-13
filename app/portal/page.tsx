import { redirect } from "next/navigation";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";

import { db } from "@/lib/db";
import { getPortalSession, safeNextPath } from "@/lib/portal-session";
import { PortalCard } from "./_components/shell";
import { PortalSubmit } from "./_components/portal-submit";
import { requestPortalLinkAction } from "./actions";

/**
 * The portal's front door. Public — this is the one page below /portal with no
 * session guard.
 *
 * Two ways in:
 *   /portal              → ask for an email, we mail a link
 *   /portal?token=…      → the link itself; handed straight to /portal/verify,
 *                          which is a Route Handler because a render is not
 *                          allowed to set a cookie
 *
 * There is no password anywhere in this flow, and no account to create: a repair
 * customer already proved who they are by handing over a laptop and an email
 * address at the counter.
 */

export const metadata = { title: "Sign in to your repair portal · RepairPilot" };

const ERRORS: Record<string, string> = {
  email: "That doesn't look like a valid email address — try again?",
  expired:
    "That sign-in link has expired or has already been replaced. Request a fresh one below.",
  invalid:
    "We couldn't read that sign-in link. Request a fresh one below and it will work.",
};

/**
 * Shown when the browser still holds a portal cookie whose customer record has
 * since gone — deleted, merged, or moved to another shop. See the guard below
 * for why this case has to be caught here.
 */
const STALE_SESSION_MESSAGE =
  "You were signed out because this account is no longer on file with the shop. Request a fresh link below, or give the shop a call.";

export default async function PortalEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string =>
    Array.isArray(params[key]) ? (params[key][0] ?? "") : (params[key] ?? "");

  const next = safeNextPath(first("next"));
  const token = first("token");

  if (token) {
    // Straight through to the Route Handler that can actually set the cookie.
    redirect(
      `/portal/verify?token=${encodeURIComponent(token)}${
        next ? `&next=${encodeURIComponent(next)}` : ""
      }`,
    );
  }

  /*
   * A cookie whose signature still verifies is not the same thing as a customer
   * who still exists. `requirePortalCustomer()` re-reads the record and bounces
   * back here when it has gone — so redirecting on the signature alone sends the
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
  const error = session
    ? STALE_SESSION_MESSAGE
    : (ERRORS[first("error")] ?? null);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-chip-accent-bg text-chip-accent-fg">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Your repair portal
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Check on your repair, review an estimate, or pay an invoice — no
            password needed.
          </p>
        </div>

        {sent ? (
          <PortalCard className="px-6 py-7 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-status-resolved-bg text-status-resolved-fg">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="mt-4 text-[17px] font-bold">Check your inbox</h2>
            {/* Intentionally says nothing about whether the address matched. */}
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              If we have your email on file, a sign-in link is on its way. It
              works for the next 24 hours.
            </p>
            <a
              href="/portal"
              className="mt-5 inline-block text-[13px] font-medium text-accent hover:underline"
            >
              Use a different email address
            </a>
          </PortalCard>
        ) : (
          <PortalCard className="px-6 py-7">
            {error ? (
              <p
                role="alert"
                className="mb-5 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-[13px] leading-relaxed text-destructive"
              >
                {error}
              </p>
            ) : null}

            <form action={requestPortalLinkAction} className="flex flex-col gap-4">
              {next ? <input type="hidden" name="next" value={next} /> : null}

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="portal-email"
                  className="text-[14px] font-semibold"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
                  <input
                    id="portal-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    className="h-12 w-full rounded-xl border border-border-strong bg-surface pl-10 pr-4 text-[15px] text-foreground outline-none transition-colors placeholder:text-faint-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Use the address you gave the shop when you dropped off your
                  device.
                </p>
              </div>

              <PortalSubmit pendingLabel="Sending your link…">
                Email me a sign-in link
              </PortalSubmit>
            </form>
          </PortalCard>
        )}

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Are you shop staff?{" "}
          <a href="/login" className="font-medium text-accent hover:underline">
            Sign in here
          </a>
          .
        </p>
      </div>
    </div>
  );
}
