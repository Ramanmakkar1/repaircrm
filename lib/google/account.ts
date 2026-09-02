import { audit } from "@/lib/audit";
import { completeSignIn, unusablePasswordHash, createShopWithOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { setPending2faCookie } from "@/lib/pending-2fa";
import { hashResetToken } from "@/lib/password-reset";
import type { SessionUser } from "@/lib/session";

import type { GoogleIdentity } from "./oidc";

/**
 * Which RepairFlow account a Google identity is, and what may be created when
 * it is none of them.
 *
 * ---------------------------------------------------------------------------
 * THE MATCHING RULES, IN ORDER
 * ---------------------------------------------------------------------------
 *   1. `googleSub` matches a User        → that is the user. The `sub` is
 *      Google's stable account id: it survives a change of address, and unlike
 *      an email it cannot be handed to somebody else.
 *   2. No sub match, but a User has that VERIFIED email → link and sign in.
 *      This is how an existing shop's staff start using the button without
 *      anybody having to migrate anything.
 *   3. No match at all → it depends entirely on the intent. A sign-in creates
 *      nothing. A signup creates a whole new tenant. An invite link is the
 *      only way to end up inside somebody else's shop.
 *
 * NEVER by email domain. "Anyone @downtownrepair.com joins Downtown Repair" is
 * how a person who registers a lookalike address walks into a tenant, and no
 * amount of verification at Google makes that a membership decision.
 *
 * `email_verified` is checked before ANY of this — see `requireVerified`. An
 * unverified Google address is an address somebody has merely typed, and rule
 * 2 would turn that into a takeover of the account that owns it. That is the
 * hole in every naive Google login.
 * ---------------------------------------------------------------------------
 *
 * NOTE: none of this touches the customer portal. Customers get in with the
 * magic links in lib/comms/config.ts and always will — a person collecting a
 * repaired phone should never need a Google account.
 */

/** The columns every sign-in path needs. */
const SIGN_IN_SELECT = {
  id: true,
  shopId: true,
  role: true,
  name: true,
  email: true,
  active: true,
  passwordChangedAt: true,
  totpEnabledAt: true,
  googleSub: true,
  avatarUrl: true,
} as const;

type SignInUser = {
  id: string;
  shopId: string;
  role: "OWNER" | "TECH" | "FRONT_DESK";
  name: string;
  email: string;
  active: boolean;
  passwordChangedAt: Date | null;
  totpEnabledAt: Date | null;
  googleSub: string | null;
  avatarUrl: string | null;
};

/**
 * What a Google round trip ended as.
 *
 * `"2fa"` is the one worth reading twice: a session was NOT issued. The
 * pending cookie was set instead and the caller must send the person to
 * /login/verify, exactly as the password path does.
 */
export type GoogleOutcome =
  | { status: "ok"; user: SessionUser; next: string }
  | { status: "2fa" }
  | { status: "error"; code: string };

// ---------------------------------------------------------------------------
// Shared steps
// ---------------------------------------------------------------------------

/**
 * The last step of any Google flow that ends in being signed in.
 *
 * ---------------------------------------------------------------------------
 * 2FA STILL APPLIES, DELIBERATELY
 * ---------------------------------------------------------------------------
 * A Google sign-in for an account with an authenticator on it does NOT mint a
 * session. It sets the same five-minute pending cookie the password path sets
 * and sends the person to /login/verify.
 *
 * The temptation is to call Google "strong enough" and skip it. It is not our
 * call to make: the shop owner switched that on knowing what it costs them
 * every morning, and the second factor is a factor THIS shop controls — a
 * compromised Google account is precisely one of the things it is there for.
 * ---------------------------------------------------------------------------
 *
 * Everything else about the session is identical to the password path: the
 * same claims, the same `pv`, the same `lastLoginAt` stamp, the same audit
 * row — so lib/session-guard.ts and password-change invalidation keep working
 * without knowing this feature exists.
 */
async function finishSignIn(
  user: SignInUser,
  next: string,
): Promise<GoogleOutcome> {
  if (user.totpEnabledAt) {
    await setPending2faCookie(user.id);
    return { status: "2fa" };
  }
  const session = await completeSignIn(user, { via: "google" });
  return { status: "ok", user: session, next };
}

/** Rule 0. Nothing below runs on an address Google has not confirmed. */
async function requireVerified(identity: GoogleIdentity): Promise<string | null> {
  if (identity.emailVerified) return null;

  // Audited against the shop of whoever owns that address, when there is one —
  // "somebody tried to sign in as you with an unverified Google address" is
  // exactly the line an owner wants in the trail.
  const target = await db.user.findUnique({
    where: { email: identity.email },
    select: { id: true, shopId: true, name: true },
  });
  if (target) {
    await audit({
      shopId: target.shopId,
      userId: null,
      action: "user.google_refused",
      entity: "user",
      entityId: target.id,
      summary: `Google sign-in refused for ${identity.email} — the address is not verified`,
      meta: { reason: "email_not_verified", googleSub: identity.sub },
    });
  } else {
    console.warn(
      `[google] refused: ${identity.email} is not a verified Google address`,
    );
  }
  return "unverified-email";
}

/**
 * Fills in what Google knows and RepairFlow does not.
 *
 * Only ever fills blanks. A person who set their display name to "Sam (bench
 * 2)" did that on purpose, and a sign-in is not the moment to overwrite it
 * with whatever Google has on file.
 */
function profilePatch(user: { name: string; avatarUrl: string | null }, identity: GoogleIdentity) {
  return {
    ...(user.name.trim() ? {} : { name: identity.name ?? identity.email }),
    ...(user.avatarUrl || !identity.picture ? {} : { avatarUrl: identity.picture }),
  };
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

/** Rules 1 and 2 only. A sign-in never creates anything. */
export async function signInWithGoogle(
  identity: GoogleIdentity,
  next: string,
): Promise<GoogleOutcome> {
  const unverified = await requireVerified(identity);
  if (unverified) return { status: "error", code: unverified };

  // Rule 1. A global lookup by a unique key, exactly as `login()` looks a
  // person up by their unique email — the only two places in the app that read
  // outside a shop, and both of them are the sign-in itself.
  const bySub = await db.user.findUnique({
    where: { googleSub: identity.sub },
    select: SIGN_IN_SELECT,
  });

  if (bySub) {
    if (!bySub.active) return { status: "error", code: await refuse(bySub, "inactive", identity) };
    const patch = profilePatch(bySub, identity);
    if (Object.keys(patch).length > 0) {
      await db.user.update({ where: { id: bySub.id }, data: patch });
    }
    return finishSignIn(bySub, next);
  }

  // Rule 2.
  const byEmail = await db.user.findUnique({
    where: { email: identity.email },
    select: SIGN_IN_SELECT,
  });

  if (!byEmail) {
    // No shop to audit against, so this one is a server-log line only.
    console.warn(`[google] refused: no RepairFlow account for ${identity.email}`);
    return { status: "error", code: "no-account" };
  }

  if (!byEmail.active) {
    return { status: "error", code: await refuse(byEmail, "inactive", identity) };
  }

  // The address matches, but that account already answers to a DIFFERENT
  // Google account. Linking a second one would give two Google identities
  // access to one RepairFlow user, which is not a thing this app supports.
  if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
    return { status: "error", code: await refuse(byEmail, "other_google_sub", identity) };
  }

  await linkRow(byEmail, identity, "signin");
  return finishSignIn(byEmail, next);
}

/** One refusal, one audit row, one code. */
async function refuse(
  user: { id: string; shopId: string; email: string },
  reason: string,
  identity: GoogleIdentity,
): Promise<string> {
  await audit({
    shopId: user.shopId,
    userId: null,
    action: "user.google_refused",
    entity: "user",
    entityId: user.id,
    summary: `Google sign-in refused for ${user.email}`,
    meta: { reason, googleSub: identity.sub },
  });
  return reason === "other_google_sub" ? "other-google" : "refused";
}

/** Writes the link and records it. Shared by rules 2, the invite and Connect. */
async function linkRow(
  user: SignInUser | { id: string; shopId: string; name: string; email: string; avatarUrl: string | null },
  identity: GoogleIdentity,
  via: "signin" | "invite" | "settings",
): Promise<void> {
  await db.user.update({
    where: { id: user.id },
    data: {
      googleSub: identity.sub,
      googleEmail: identity.email,
      googleLinkedAt: new Date(),
      ...profilePatch(user, identity),
    },
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.google_linked",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} connected the Google account ${identity.email}`,
    meta: { via, googleEmail: identity.email },
  });
}

// ---------------------------------------------------------------------------
// Sign up — a brand new tenant
// ---------------------------------------------------------------------------

/**
 * Creates Shop + "Main" Location + OWNER, exactly as a password signup does,
 * through the same transaction (`createShopWithOwner`). The password is 32
 * random bytes nobody has ever seen, and `hasPassword` says so.
 *
 * The shop name is a placeholder built from the person's name: Google knows
 * who they are and has no idea what their shop is called. Renaming it is the
 * first card of the /setup wizard they land on.
 */
export async function signUpWithGoogle(identity: GoogleIdentity): Promise<GoogleOutcome> {
  const unverified = await requireVerified(identity);
  if (unverified) return { status: "error", code: unverified };

  const existing = await db.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  // Mirrors `signup()`: an address that already has an account is sent to sign
  // in, not quietly signed in from the "create a shop" button.
  if (existing) return { status: "error", code: "email-taken" };

  const takenSub = await db.user.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true },
  });
  if (takenSub) return { status: "error", code: "sub-taken" };

  const person = identity.name?.trim() || identity.email.split("@")[0];

  const user = await createShopWithOwner({
    shopName: `${person}'s shop`,
    name: person,
    email: identity.email,
    passwordHash: await unusablePasswordHash(),
    google: {
      sub: identity.sub,
      email: identity.email,
      avatarUrl: identity.picture,
    },
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.signup_google",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} created a shop with Google (${identity.email})`,
    meta: { googleEmail: identity.email },
  });

  // A brand new shop goes to the setup wizard, not the empty dashboard —
  // the same destination signupAction() redirects to.
  return finishSignIn(
    { ...user, active: true, totpEnabledAt: null, googleSub: identity.sub, avatarUrl: identity.picture },
    "/setup",
  );
}

// ---------------------------------------------------------------------------
// Invite acceptance
// ---------------------------------------------------------------------------

/**
 * "Continue with Google" on the page behind an invite link.
 *
 * The token is validated exactly as /reset-password/[token] validates it —
 * unused, unexpired, on an active account — and the Google address MUST be the
 * one the invite was sent to. Without that check, anyone holding a forwarded
 * invite email could attach their own Google account to a colleague's seat.
 *
 * The token is burned inside the same transaction that writes the link, with
 * `usedAt: null` still in the where clause, so two simultaneous submits cannot
 * both consume it.
 */
export async function acceptInviteWithGoogle(
  identity: GoogleIdentity,
  token: string,
): Promise<GoogleOutcome> {
  const unverified = await requireVerified(identity);
  if (unverified) return { status: "error", code: unverified };

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: { select: SIGN_IN_SELECT },
    },
  });

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return { status: "error", code: "invite-expired" };
  }
  const user = row.user;
  if (!user.active) return { status: "error", code: "invite-expired" };

  if (user.email !== identity.email) {
    await audit({
      shopId: user.shopId,
      userId: null,
      action: "user.google_refused",
      entity: "user",
      entityId: user.id,
      summary: `Invite for ${user.email} refused a Google sign-in as ${identity.email}`,
      meta: { reason: "invite_email_mismatch", googleEmail: identity.email },
    });
    return { status: "error", code: "invite-mismatch" };
  }

  if (user.googleSub && user.googleSub !== identity.sub) {
    return { status: "error", code: await refuse(user, "other_google_sub", identity) };
  }

  const takenSub = await db.user.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true },
  });
  if (takenSub && takenSub.id !== user.id) {
    return { status: "error", code: "sub-taken" };
  }

  const now = new Date();
  const burned = await db.$transaction(async (tx) => {
    const spent = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count === 0) return false;

    await tx.user.update({
      where: { id: user.id },
      data: {
        googleSub: identity.sub,
        googleEmail: identity.email,
        googleLinkedAt: now,
        // The invite is satisfied: they have a way in. No password was chosen,
        // so `hasPassword` stays false and Disconnect will refuse until one is.
        mustChangePassword: false,
        // Stamped like the password path stamps it, so any session issued
        // before this moment is refused by lib/session-guard.ts.
        passwordChangedAt: now,
        ...profilePatch(user, identity),
      },
    });
    return true;
  });

  if (!burned) return { status: "error", code: "invite-expired" };

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.google_linked",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} accepted their invite with the Google account ${identity.email}`,
    meta: { via: "invite", googleEmail: identity.email },
  });

  // Re-read `passwordChangedAt` so the session's `pv` matches what was just
  // written; a stale zero here would sign them straight back out.
  return finishSignIn({ ...user, passwordChangedAt: now }, "/");
}

// ---------------------------------------------------------------------------
// Linking from inside the app
// ---------------------------------------------------------------------------

/** Settings → My profile → "Connect". The person is already signed in. */
export async function linkGoogleToUser(
  identity: GoogleIdentity,
  session: SessionUser,
): Promise<{ code: string }> {
  const unverified = await requireVerified(identity);
  if (unverified) return { code: unverified };

  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { id: true, shopId: true, name: true, email: true, googleSub: true, avatarUrl: true },
  });
  if (!user) return { code: "signed-out" };

  if (user.googleSub === identity.sub) return { code: "already-linked" };
  if (user.googleSub) return { code: "other-google" };

  const takenSub = await db.user.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true },
  });
  if (takenSub) {
    await audit({
      shopId: user.shopId,
      userId: user.id,
      action: "user.google_refused",
      entity: "user",
      entityId: user.id,
      summary: `${user.name} could not connect ${identity.email} — already on another account`,
      meta: { reason: "google_sub_taken", googleEmail: identity.email },
    });
    return { code: "sub-taken" };
  }

  // The Google address is NOT required to match `email`. The person is already
  // authenticated here, so there is nothing to take over: a technician linking
  // their personal Google account to a work address is ordinary, and the
  // address that was linked is shown on the profile so it is never a mystery.
  await linkRow(user, identity, "settings");
  return { code: "linked" };
}

/**
 * Settings → My profile → "Disconnect".
 *
 * REFUSED while the account has no password of its own. Someone who signed up
 * with Google and then disconnects it has no way back in at all — not even a
 * reset link would help, because they would have nothing to reset toward until
 * they asked for one, and by then they are locked out of a shop they own.
 */
export async function unlinkGoogleFromUser(
  session: SessionUser,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: {
      id: true,
      shopId: true,
      name: true,
      googleSub: true,
      googleEmail: true,
      hasPassword: true,
    },
  });
  if (!user) return { ok: false, error: "Your account could not be loaded." };
  if (!user.googleSub) {
    return { ok: false, error: "No Google account is connected." };
  }
  if (!user.hasPassword) {
    return {
      ok: false,
      error:
        "Set a password first, or you'd have no way back in — sign out and use “Forgot password?” to choose one.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      googleSub: null,
      googleEmail: null,
      googleLinkedAt: null,
      // The avatar was a Google-hosted URL; it goes with the connection.
      avatarUrl: null,
    },
  });

  await audit({
    shopId: user.shopId,
    userId: user.id,
    action: "user.google_unlinked",
    entity: "user",
    entityId: user.id,
    summary: `${user.name} disconnected the Google account ${user.googleEmail ?? ""}`.trim(),
    meta: { googleEmail: user.googleEmail },
  });

  return { ok: true };
}
