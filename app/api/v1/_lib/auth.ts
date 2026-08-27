import type { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { bearerToken, hashApiKey, isApiKeyShape } from "@/lib/api-key";
import { apiError } from "./respond";

/**
 * Bearer-key authentication for /api/v1.
 *
 *     Authorization: Bearer rfk_<40 hex>
 *
 * The presented key is sha256'd and looked up against the unique
 * `ApiKey.keyHash` index — one read, no scan, and no plaintext key has ever
 * been stored to leak. A constant-time compare is not needed because we never
 * compare the secret in application code; equality happens inside the index on
 * a value the attacker cannot invert.
 *
 * WHAT THIS RETURNS IS THE TENANT BOUNDARY. `shopId` comes from the key row and
 * nowhere else — never from a header, a query string or a body field — so a
 * caller can only ever reach their own shop's rows. Every handler must thread
 * it into every `where`.
 */

export type ApiAuth = { shopId: string; keyId: string };

export type ApiAuthResult = ApiAuth | { response: NextResponse };

const UNAUTHORIZED =
  "Provide a valid API key as `Authorization: Bearer rfk_…`. Create one in Settings → API keys.";

export async function authApiKey(request: Request): Promise<ApiAuthResult> {
  const token = bearerToken(request.headers.get("authorization"));

  // Reject on shape before touching the database: a malformed header is the
  // overwhelmingly common case (a curl with no key at all) and it should not
  // cost a query.
  if (!token || !isApiKeyShape(token)) {
    return { response: apiError("unauthorized", UNAUTHORIZED) };
  }

  const key = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(token) },
    select: { id: true, shopId: true, active: true },
  });

  if (!key) {
    return { response: apiError("unauthorized", UNAUTHORIZED) };
  }

  // A revoked key is the same 401 as an unknown one. Saying "this key was
  // revoked" would confirm to a thief that the key they hold is real.
  if (!key.active) {
    return { response: apiError("unauthorized", UNAUTHORIZED) };
  }

  touch(key.id);

  return { shopId: key.shopId, keyId: key.id };
}

/**
 * Stamps `lastUsedAt` without blocking the response.
 *
 * "Last used" is an operator convenience on the settings screen, not part of
 * the answer, so a slow or failed write must never turn a good API call into a
 * 500 — hence the detached promise with a swallowed rejection.
 */
function touch(keyId: string): void {
  void db.apiKey
    .update({ where: { id: keyId }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* best-effort telemetry; never fails the request */
    });
}

/** Narrowing helper so handlers read as `if (isDenied(auth)) return auth.response;` */
export function isDenied(result: ApiAuthResult): result is { response: NextResponse } {
  return "response" in result;
}
