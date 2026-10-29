import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { DEFAULT_GRACE_HOURS, SUPPORT_EMAIL, deletionDateLabel } from "@/lib/account-deletion/config";
import { resolveCancelToken } from "@/lib/account-deletion/shop";
import { KeepShopWithLink, KeepShopWithPassword } from "./keep-shop";

/**
 * Public account-deletion instructions. This is the URL given to Google Play
 * as the "web link to request account deletion", and the page the emails and
 * the in-app flow point at.
 *
 * Indexable on purpose: someone searching "delete Repairs helper account" from
 * outside the app should land here, and it contains nothing private. The
 * one-off states (?done, ?scheduled, ?keep=<token>) are excluded from the
 * index via the canonical URL.
 */
export const metadata: Metadata = {
  title: "Delete your account · Repairs helper",
  description:
    "How to delete your Repairs helper login or your whole shop, what is deleted and when, and how to cancel within the grace period.",
  alternates: { canonical: "/delete-account" },
  robots: { index: true, follow: true },
};

const GRACE_DAYS = Math.round(DEFAULT_GRACE_HOURS / 24);

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const keepToken = one("keep");
  const pending = keepToken ? await resolveCancelToken(keepToken) : null;

  return (
    <LegalPage
      eyebrow="Account deletion"
      title="Delete your account"
      intro="You can delete your own Repairs helper login, or, if you own the shop, the whole shop and all of its data. Both are done inside the app, on the web or in the phone app."
    >
      {one("done") === "login" ? (
        <section role="status" className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2>Your login has been deleted</h2>
          <p>
            You have been signed out on every device. We&rsquo;ve emailed a confirmation to your old address if email
            is set up for your shop.
          </p>
        </section>
      ) : null}

      {one("scheduled") ? (
        <section role="status" className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2>Your shop is scheduled for deletion</h2>
          <p>
            Everyone has been signed out and nobody can sign in. The shop&rsquo;s data will be permanently deleted
            after {GRACE_DAYS} days. We&rsquo;ve emailed you a &ldquo;Keep my shop&rdquo; link; you can also keep it with
            the form further down this page.
          </p>
        </section>
      ) : null}

      {keepToken ? (
        <section className="space-y-3">
          {pending ? (
            <KeepShopWithLink
              token={keepToken}
              shopName={pending.shopName}
              dateLabel={deletionDateLabel(pending.purgeAfter, pending.timezone)}
            />
          ) : (
            <div role="status" className="space-y-3 rounded-xl border border-border bg-surface p-5">
              <h2>This link no longer works</h2>
              <p>
                The deletion may already have been cancelled or completed, or a newer request replaced it. Email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you need help.
              </p>
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2>Delete your login</h2>
        <p>Any staff member can delete their own login. It takes effect straight away.</p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>Sign in to Repairs helper (on the web at repairshelper.com, or in the app).</li>
          <li>Open the account menu (your initials) and choose <strong>Account</strong>, or go to Settings &rarr; Account.</li>
          <li>
            Choose <strong>Delete my login</strong>, confirm with your password (or an emailed code if you sign in with
            Google) and your two-step code if you use one.
          </li>
        </ol>
        <p>
          <strong>What is deleted:</strong> your name, email address, password, two-step sign-in settings, PIN, linked
          Google account, saved views and phone notifications. You are signed out everywhere.
        </p>
        <p>
          <strong>What the shop keeps:</strong> the repairs, notes, payments, time entries and clock-ins you recorded
          belong to the shop you worked for. They stay in the shop&rsquo;s records and show as &ldquo;Deleted
          user&rdquo;, without your name or email. If the shop is ever deleted, they go too.
        </p>
        <p>
          The last owner of a shop can&rsquo;t delete only their own login while other staff remain. Make someone else
          an owner first (Settings &rarr; Team), or delete the whole shop.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Delete your whole shop (owners)</h2>
        <ol className="ml-5 list-decimal space-y-2">
          <li>Sign in as an owner and open <strong>Account</strong>.</li>
          <li>
            Choose <strong>Delete this shop</strong>, type the shop name, and confirm with your password (or emailed
            code) and two-step code.
          </li>
        </ol>
        <p>
          <strong>Straight away:</strong> every login and API key for the shop is switched off and everyone is signed
          out. Automatic reminders, invoices and campaigns to your customers stop.
        </p>
        <p>
          <strong>After {GRACE_DAYS} days:</strong> everything is permanently deleted: customers and their devices,
          repairs, estimates, invoices, payments, stock, purchase orders, appointments, messages, staff logins,
          settings, connected-service links, the shop logo and every uploaded photo and file.
        </p>
        <p>
          <strong>What is kept:</strong> nothing in the app. Our database backups are kept for 14 days and then
          deleted, so copies roll off within two weeks of the deletion; backups are only used to recover from a
          disaster. Payment records held by your own Stripe or accounting accounts are yours and are not affected.
        </p>
      </section>

      <section id="keep" className="space-y-3">
        <h2>Changed your mind?</h2>
        <p>
          Within the {GRACE_DAYS} days, use the <strong>Keep my shop</strong> button in the email we sent you, or enter
          an owner&rsquo;s email and password here. Logins that were on come back exactly as they were.
        </p>
        <KeepShopWithPassword />
      </section>

      <section className="space-y-3">
        <h2>Can&rsquo;t sign in?</h2>
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion`}>{SUPPORT_EMAIL}</a> from the address
          on the account and tell us whether you want your login or the whole shop deleted. We check that the request
          really comes from the account holder (for a whole shop, an owner) before deleting anything.
        </p>
        <p>
          If you are a <strong>customer of a repair shop</strong>, your details belong to that shop: ask the shop to
          delete them. They can do it from your customer record.
        </p>
      </section>
    </LegalPage>
  );
}
