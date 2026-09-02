/**
 * Shapes for Settings → My profile.
 *
 * Pure, like ./types.ts — imported by both the client tab and the server
 * actions, so no `db`, no `next/*`, no "use server".
 */

export type ProfileValues = {
  name: string;
  email: string;
  role: string;
  /** ISO string when two-step verification is on, null when it is off. */
  totpEnabledAt: string | null;
  /** How many unused recovery codes are left. */
  recoveryCodesLeft: number;
  lastLoginAt: string | null;

  // --- Sign in with Google ---------------------------------------------
  /** False when the server has no GOOGLE_CLIENT_ID/SECRET — the row is hidden. */
  googleAvailable: boolean;
  /** The linked Google address, or null when nothing is connected. */
  googleEmail: string | null;
  googleLinkedAt: string | null;
  /** Google's profile picture, when there is one. */
  avatarUrl: string | null;
  /**
   * False for an account whose owner has never chosen a password — a Google
   * signup, or an invite accepted with Google. Disconnecting is refused while
   * it is false, because it would leave them with no way back in.
   */
  hasPassword: boolean;
  /** The outcome of a Connect round trip that just came back, if any. */
  googleNotice: { tone: "ok" | "bad"; text: string } | null;
};

/**
 * Everything the setup dialog needs to show. The secret is already stored on
 * the user row at this point but 2FA is NOT on yet — nothing is enforced until
 * a code proves the authenticator actually has it.
 */
export type TotpSetup = {
  /** Base32, grouped in fours for someone typing it by hand. */
  manualKey: string;
  /** The `otpauth://` URI, shown under the QR for apps that take a paste. */
  otpauthUrl: string;
  /** A PNG data URL rendered on the server — no QR library in the browser. */
  qrDataUrl: string;
};

export type TotpSetupResult =
  | { ok: true; setup: TotpSetup }
  | { ok: false; error: string };

/** Recovery codes exist in plaintext exactly once: in this response. */
export type TotpEnableResult =
  | { ok: true; codes: string[] }
  | { ok: false; error: string };
