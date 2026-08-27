import { createHash, randomBytes } from "node:crypto";

/**
 * Public-API key minting and hashing.
 *
 * Deliberately NOT bcrypt (which lib/auth.ts uses for passwords). A password is
 * low-entropy human input that has to be slow to guess; an API key is 160 bits
 * of CSPRNG output, where the only realistic attack is stealing the stored
 * value. SHA-256 gives that protection at a cost the request path can afford —
 * a bcrypt compare on every API call would cap throughput at a handful of
 * requests per second per core, and the deterministic hash is what lets the
 * lookup be a single indexed read on `ApiKey.keyHash` rather than a scan.
 *
 * Shape: `rfk_` + 40 lowercase hex characters (20 random bytes).
 * Stored: the sha256 of the whole key. `prefix` is the first 8 hex characters,
 * kept in the clear so the settings screen can say which key is which.
 */

export const API_KEY_PREFIX = "rfk_";

/** `rfk_` + exactly 40 hex chars. Cheap reject before touching the database. */
const KEY_PATTERN = /^rfk_[0-9a-f]{40}$/;

export type MintedApiKey = {
  /** The full secret. Shown to the operator exactly once, never stored. */
  key: string;
  keyHash: string;
  prefix: string;
};

export function mintApiKey(): MintedApiKey {
  const hex = randomBytes(20).toString("hex");
  const key = `${API_KEY_PREFIX}${hex}`;
  return { key, keyHash: hashApiKey(key), prefix: hex.slice(0, 8) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isApiKeyShape(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** "rfk_ab12cd34…" — how a key is identified everywhere after creation. */
export function displayApiKey(prefix: string): string {
  return `${API_KEY_PREFIX}${prefix}…`;
}

/** Pulls the token out of `Authorization: Bearer <token>`, or null. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
