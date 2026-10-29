import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { graceHours } from "@/lib/account-deletion/config";
import { loginDeletionBlock } from "@/lib/account-deletion/user";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DeleteLoginButton, DeleteShopButton } from "./deletion-dialogs";

export const metadata = { title: "Account · Repairs helper" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  TECH: "Technician",
  FRONT_DESK: "Front desk",
};

/**
 * Account: who you are signed in as, and the two ways out.
 *
 *   Delete my login    any staff member, their own login only
 *   Delete this shop   owners only; scheduled, with a grace period
 *
 * Linked from Settings and the account menu. The native app shells load this
 * same page in their WebView, which is what App Store rule 5.1.1(v) and
 * Google Play's in-app deletion requirement ask for.
 */
export default async function AccountPage() {
  const session = await requireUser();

  const [user, shop, staffCount, block] = await Promise.all([
    db.user.findFirst({
      where: { id: session.userId, shopId: session.shopId },
      select: { name: true, email: true, role: true, hasPassword: true, totpEnabledAt: true, googleEmail: true },
    }),
    db.shop.findUnique({ where: { id: session.shopId }, select: { name: true } }),
    db.user.count({ where: { shopId: session.shopId, active: true } }),
    loginDeletionBlock(session),
  ]);
  if (!user || !shop) return null;

  const isOwner = session.role === "OWNER";
  const days = Math.round(graceHours() / 24);
  const windowLabel = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${graceHours()} hours`;
  const needs = { password: user.hasPassword, emailCode: !user.hasPassword, totp: Boolean(user.totpEnabledAt) };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Account" description="Your login, and how to delete it or the whole shop." />

      <Card>
        <CardHeader title="Signed in as" />
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-3 px-4 py-4 text-[15px] sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="min-w-0 break-words font-medium">{user.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 break-words font-medium">{user.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">{ROLE_LABEL[user.role] ?? user.role}</dd>
          <dt className="text-muted-foreground">Shop</dt>
          <dd className="min-w-0 break-words font-medium">{shop.name}</dd>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Delete my login" />
        <div className="flex flex-col gap-4 px-4 py-4 text-[15px] leading-relaxed">
          <p>
            Removes your name, email, password, two-step sign-in and phone notifications, and signs you out on every
            device. It happens straight away.
          </p>
          <p className="text-muted-foreground">
            The repairs, notes, payments and hours you recorded belong to {shop.name} and stay with the shop. They
            will show as &ldquo;Deleted user&rdquo;.
          </p>
          {block.blocked && block.reason === "last-owner" ? (
            <div role="note" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-hover/50 p-4">
              <p className="font-medium">You&rsquo;re the only owner of {shop.name}.</p>
              <p className="text-muted-foreground">
                {staffCount > 1
                  ? "Make someone else an owner first, then delete your login. Or, if the shop is closing, delete the whole shop below."
                  : "You're also the only person on the team, so deleting your login means deleting the whole shop below."}
              </p>
              {staffCount > 1 ? (
                <Link
                  href="/settings?tab=team"
                  data-touch-control
                  className="inline-flex min-h-12 w-fit items-center rounded-md border border-border-strong bg-surface px-4 font-semibold hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Go to Team
                </Link>
              ) : null}
            </div>
          ) : (
            <DeleteLoginButton needs={needs} email={user.email} />
          )}
        </div>
      </Card>

      {isOwner ? (
        <Card id="delete-shop">
          <CardHeader title="Delete this shop" />
          <div className="flex flex-col gap-4 px-4 py-4 text-[15px] leading-relaxed">
            <p>
              Deletes {shop.name} and everything in it: customers, repairs, estimates, invoices, payments, stock,
              staff logins, settings and uploaded photos and files.
            </p>
            <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
              <li>Everyone is signed out and nobody can sign in, straight away.</li>
              <li>
                You have {windowLabel} to change your mind. After that the data is permanently deleted and can&rsquo;t
                be recovered.
              </li>
              <li>Export anything you need to keep (Reports, Invoices) before you start.</li>
            </ul>
            <DeleteShopButton needs={needs} email={user.email} shopName={shop.name} windowLabel={windowLabel} />
          </div>
        </Card>
      ) : null}

      <p className="px-1 pb-4 text-[14px] text-muted-foreground">
        Questions about your data? Read{" "}
        <Link href="/delete-account" className="font-semibold text-foreground underline underline-offset-4">
          how account deletion works
        </Link>{" "}
        or email{" "}
        <a href="mailto:support@repairshelper.com" className="font-semibold text-foreground underline underline-offset-4">
          support@repairshelper.com
        </a>
        .
      </p>
    </div>
  );
}
