import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) and the one-time recovery codes that back it up.
 *
 * `node:crypto` only — no dependency. Authenticator apps (Google Authenticator,
 * 1Password, Authy, Bitwarden) all speak the same dialect and it is a small one:
 * HMAC-SHA1 over a 30-second counter, truncated to 6 digits. Anything fancier
 * is not what the QR code standard describes, so plain is also correct.
 *
 * Secrets are base32 because that is what the `otpauth://` URI carries and what
 * a person types when their camera will not focus.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;
/** Accept the neighbouring steps: phone clocks drift, and people type slowly. */
const WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ---------------------------------------------------------------------------
// base32 (RFC 4648, no padding)
// ---------------------------------------------------------------------------

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Decodes a base32 secret. Spaces, lowercase and `=` padding are all tolerated
 * because that is how the string comes back when someone copies it off a screen.
 * Returns an empty buffer for anything that is not base32 at all.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return Buffer.alloc(0);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// Secrets and codes
// ---------------------------------------------------------------------------

/** 20 random bytes — the RFC 4226 recommendation, and 32 base32 characters. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The 6-digit code for one counter value. Exported so tests can pin a step. */
export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  if (key.length === 0) return "";

  const message = Buffer.alloc(8);
  // Counters stay well inside 2^53, so the high word is written from the float.
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = crypto.createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The counter for an instant — exported so the UI can show time remaining. */
export function totpCounter(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

/**
 * Verifies a typed code against the secret, allowing one step either side.
 *
 * The comparison is constant-time per candidate. Whitespace is stripped because
 * several authenticators display the code as "123 456".
 */
export function verifyTotp(
  secret: string,
  code: string,
  at: Date = new Date(),
): boolean {
  const typed = code.replace(/\D/g, "");
  if (typed.length !== DIGITS) return false;
  if (!secret) return false;

  const counter = totpCounter(at);
  let matched = false;
  for (let drift = -WINDOW; drift <= WINDOW; drift++) {
    const candidate = totpCode(secret, counter + drift);
    if (candidate.length !== DIGITS) return false;
    // No early return: every step is compared so the loop takes the same time
    // whether the match was the first candidate or the last.
    if (timingSafeEqualString(candidate, typed)) matched = true;
  }
  return matched;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** The string behind the QR code. Label and issuer both read "RepairFlow". */
export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`RepairFlow:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: "RepairFlow",
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** "JBSW Y3DP EHPK 3PXP" — the manual-entry form, in groups of four. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

export const RECOVERY_CODE_COUNT = 8;

/** Unambiguous alphabet: no 0/O, no 1/I/L — these get read aloud and copied. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomRecoveryCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    chars.push(RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]);
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Uppercases and re-inserts the dash, so "abcd1234" matches "ABCD-1234". */
export function normalizeRecoveryCode(input: string): string {
  const cleaned = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function hashRecoveryCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeRecoveryCode(code))
    .digest("hex");
}

/**
 * Eight fresh codes: the plaintext (shown once) and the sha256 of each (stored).
 * Same bargain as an API key — losing them means generating a new set.
 */
export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, randomRecoveryCode);
  return { codes, hashes: codes.map(hashRecoveryCode) };
}
