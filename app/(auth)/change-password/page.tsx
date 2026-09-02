import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Set your password · RepairFlow",
};

/**
 * The wall an account with `mustChangePassword` hits.
 *
 * It lives in the (auth) group rather than (app) on purpose: the (app) layout
 * is what redirects here, and a page inside that layout would redirect to
 * itself forever. The auth card is also exactly the right frame for it — one
 * job, no navigation, nothing else reachable until it is done.
 */
export default async function ChangePasswordPage() {
  const session = await requireUser();

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { mustChangePassword: true },
  });

  return (
    <>
      <div className="mb-7 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {user?.mustChangePassword ? "Set your password" : "Change your password"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {user?.mustChangePassword
            ? `Pick a password only you know, ${session.name.split(" ")[0]}. You'll need it every time you sign in.`
            : "Choose a new password. Every other device signed in as you will be signed out."}
        </p>
      </div>

      <ChangePasswordForm />
    </>
  );
}
