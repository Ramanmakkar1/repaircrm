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
