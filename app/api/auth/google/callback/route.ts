import { NextResponse } from "next/server";

import { clientIp } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import {
  acceptInviteWithGoogle,
  linkGoogleToUser,
  signInWithGoogle,
  signUpWithGoogle,
  type GoogleOutcome,
} from "@/lib/google/account";
import { googleConfigured } from "@/lib/google/config";
import {
  GoogleAuthError,
  exchangeCodeForIdentity,
  takeFlowCookie,
  verifyState,
  type GoogleIntent,
} from "@/lib/google/oidc";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/auth/google/callback — step two, and the only place a Google
 * identity turns into a RepairPilot session.
 *
 * The order of the checks is the security of this route, so it is worth
 * reading top to bottom:
 *
 *   1. throttle by IP — this endpoint is reachable by anyone, and every hit
 *      costs an outbound request to Google;
 *   2. verify the signed `state` — it, not the query string, decides the
 *      intent, so a forged callback cannot pick "create me a shop";
 *   3. TAKE the flow cookie (read and clear in one step) and require its id and
 *      nonce to match the state's. This is what makes the callback single-use:
 *      a replayed URL finds no cookie and stops here;
 *   4. exchange the code with the PKCE verifier from that cookie;
 *   5. verify the id_token against Google's JWKS — signature, iss, aud, exp,
 *      and the nonce we sent (lib/google/oidc.ts);
 *   6. only then, decide which account this is (lib/google/account.ts).
 *
 * Nothing here logs a token, a code or the client secret.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Twenty callbacks per address per quarter hour — a person needs one. */
const CALLBACK_LIMIT = 20;
const CALLBACK_WINDOW_MS = 15 * 60 * 1000;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = url.origin;

  /** Where a code lands, which depends on the button that was pressed. */
  const back = (intent: GoogleIntent | null, code: string) => {
    const path =
      intent?.kind === "link"
        ? "/settings?tab=profile"
        : intent?.kind === "invite"
          ? `/reset-password/${intent.token}`
          : intent?.kind === "signup"
            ? "/signup"
            : "/login";
    const target = new URL(path, origin);
    target.searchParams.set("google", code);
    return NextResponse.redirect(target);
  };

  if (!googleConfigured()) return back(null, "not-configured");

  // 1. Throttle. Keyed on the address rather than an account, because at this
  //    point there is no account — only a stranger with a URL.
  const ip = await clientIp();
  const throttle = rateLimit(
    `google-callback:${ip ?? "unknown"}`,
    CALLBACK_LIMIT,
    CALLBACK_WINDOW_MS,
  );
  if (!throttle.allowed) return back(null, "rate-limited");

  // 2. The signed state. Read before anything else is believed.
  const state = await verifyState(url.searchParams.get("state"));

  // The person pressed Cancel on Google's account chooser. Not an error, but
  // the flow cookie should not be left lying around either.
  if (url.searchParams.get("error")) {
    await takeFlowCookie();
    return back(state?.intent ?? null, "cancelled");
  }

  if (!state) {
    // Tampered, expired, or signed with a different AUTH_SECRET. There is no
    // shop to attribute this to, so the server log is the only honest place
    // for it — an AuditLog row needs a tenant, and inventing one would be
    // worse than not having the row.
    console.warn("[google] callback refused: state did not verify");
    await takeFlowCookie();
    return back(null, "bad-state");
  }

  // 3. Single use. Reading it clears it, whatever happens next.
  const flow = await takeFlowCookie();
  if (!flow || flow.id !== state.id || flow.nonce !== state.nonce) {
    console.warn(
      "[google] callback refused: no matching flow cookie (expired, replayed, or another browser)",
    );
    return back(state.intent, "expired");
  }

  const code = url.searchParams.get("code");
  if (!code) return back(state.intent, "bad-request");

  // 4 + 5. Exchange, then verify the id_token properly.
  let identity;
  try {
    identity = await exchangeCodeForIdentity({
      code,
      verifier: flow.verifier,
      nonce: state.nonce,
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) return back(state.intent, error.code);
    console.warn(
      `[google] callback failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return back(state.intent, "failed");
  }

  // 6. Which account is this?
  if (state.intent.kind === "link") {
    const session = await getSession();
    if (!session) return back(state.intent, "signed-out");
    const { code: result } = await linkGoogleToUser(identity, session);
    return back(state.intent, result);
  }

  let outcome: GoogleOutcome;
  if (state.intent.kind === "signup") {
    outcome = await signUpWithGoogle(identity);
  } else if (state.intent.kind === "invite") {
    outcome = await acceptInviteWithGoogle(identity, state.intent.token);
  } else {
    outcome = await signInWithGoogle(identity, state.next);
  }

  if (outcome.status === "error") return back(state.intent, outcome.code);

  // No session yet: the account has an authenticator on it, and a federated
  // sign-in is not a reason to skip the factor the shop owner turned on.
  if (outcome.status === "2fa") {
    const verify = new URL("/login/verify", origin);
    verify.searchParams.set("next", state.intent.kind === "signup" ? "/setup" : state.next);
    return NextResponse.redirect(verify);
  }

  return NextResponse.redirect(new URL(outcome.next, origin));
}
