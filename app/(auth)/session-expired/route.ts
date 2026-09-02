import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";

/**
 * Where a session that is no longer valid gets sent.
 *
 * A layout cannot clear a cookie mid-render, so `requireLiveUser()` redirects
 * here instead: this handler drops `rf_session` and bounces to /login with a
 * notice explaining what happened. Without the clear the login page would send
 * the browser straight back to a session it has already rejected.
 */
const NOTICES: Record<string, string> = {
  password: "password-changed",
  inactive: "inactive",
  gone: "signed-out",
};

export async function GET(request: Request) {
  await destroySession();

  const reason = new URL(request.url).searchParams.get("reason") ?? "";
  const notice = NOTICES[reason] ?? "signed-out";

  return NextResponse.redirect(
    new URL(`/login?notice=${notice}`, request.url),
    { status: 303 },
  );
}
