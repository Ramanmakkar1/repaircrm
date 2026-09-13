/**
 * What a Google sign-in outcome says on screen.
 *
 * Pure — no `db`, no `next/*` — so a server page and a client tab can both
 * import it. The route handlers can only speak through the query string (they
 * redirect from Google's domain, with no state of their own to carry a message
 * in), so every outcome is a short code here and a sentence there.
 *
 * ONE PLAIN SENTENCE, WITH A NEXT ACTION. No OAuth vocabulary reaches the
 * screen: an operator who sees "invalid_grant" learns nothing they can act on,
 * and every distinct protocol failure is the same problem to them — press the
 * button again.
 */

/** The query parameter every one of these rides in: `?google=<code>`. */
export const GOOGLE_NOTICE_PARAM = "google";

export type GoogleNotice = { tone: "ok" | "bad"; text: string };

const OK: Record<string, string> = {
  linked: "Your Google account is connected. You can sign in with it from now on.",
  "already-linked": "That Google account was already connected to your profile.",
};

const BAD: Record<string, string> = {
  "not-configured":
    "Google sign-in isn't set up on this server. Use your email and password instead.",
  cancelled: "Google sign-in was cancelled — nothing has changed.",
  "bad-request": "That sign-in didn't come through properly. Press Continue with Google again.",
  "bad-state":
    "That sign-in took too long or was interrupted. Press Continue with Google again.",
  expired:
    "That sign-in took too long or was already used. Press Continue with Google again.",
  "bad-token":
    "We couldn't confirm that Google sign-in. Press Continue with Google again.",
  "exchange-failed": "Google refused the sign-in. Press Continue with Google again.",
  unreachable: "Google couldn't be reached just now. Try again in a moment.",
  jwks: "Google couldn't be reached just now. Try again in a moment.",
  "unverified-email":
    "That Google address isn't verified yet. Verify it with Google, then try again.",
  "no-account":
    "There's no RepairPilot account for that Google address. Ask your shop owner to invite you, or create a new shop.",
  // Deliberately the same generic refusal the password path gives a
  // deactivated account, so Google sign-in cannot be used to find out whose
  // account has been switched off.
  refused: "Incorrect email or password.",
  "email-taken":
    "An account with that email already exists. Sign in instead of creating a shop.",
  "sub-taken":
    "That Google account is already connected to a different RepairPilot user.",
  "other-google":
    "Your account is connected to a different Google account. Disconnect that one first.",
  "invite-expired":
    "That invite link has expired or has already been used. Ask your shop owner to send a new one.",
  "invite-mismatch":
    "That invite was sent to a different email address. Use the Google account it was sent to, or set a password instead.",
  "signed-out": "Sign in first, then connect Google from Settings → My profile.",
  "rate-limited":
    "Too many Google sign-in attempts from this device. Try again in a few minutes.",
  failed: "That Google sign-in didn't work. Press Continue with Google again.",
};

/** Turns a `?google=` code into something to render, or null when absent. */
export function googleNotice(code: string | null | undefined): GoogleNotice | null {
  if (!code) return null;
  if (OK[code]) return { tone: "ok", text: OK[code] };
  return { tone: "bad", text: BAD[code] ?? BAD.failed };
}

/** True for the one refusal that deserves a "Create a shop" link beside it. */
export function offersSignup(code: string | null | undefined): boolean {
  return code === "no-account";
}
