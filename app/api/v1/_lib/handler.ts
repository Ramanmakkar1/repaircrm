import { NextResponse } from "next/server";

import { authApiKey, isDenied, type ApiAuth } from "./auth";
import { consume, rateHeaders } from "./rate-limit";
import { apiError, CORS_HEADERS } from "./respond";

/**
 * The wrapper every /api/v1 handler is exported through.
 *
 * It owns the three things that must be true of EVERY v1 response and must
 * never be re-implemented per route:
 *
 *   1. AUTH      the bearer key is resolved to a shop before the handler runs,
 *                so a handler can only ever receive an already-scoped `shopId`.
 *   2. LIMITS    one token is spent per authenticated request, and the
 *                X-RateLimit-* headers ride on the answer either way.
 *   3. CORS      set by the response helpers in ./respond, and re-applied here
 *                so a handler that returns a hand-rolled NextResponse still
 *                gets them.
 *
 * A handler that throws becomes a 500 with the same envelope as every other
 * error rather than Next's HTML error page — an integration parsing JSON should
 * never receive markup.
 *
 * WHAT AN API KEY IS ALLOWED TO DO: everything an OWNER can do in the UI. There
 * are no per-key scopes in v1. A key can create, edit and delete, so it is
 * issued and revoked in Settings → API keys by an owner and nobody else.
 */
export type ApiHandler<C> = (
  request: Request,
  auth: ApiAuth,
  context: C,
) => Promise<NextResponse>;

export function withApiKey<C>(handler: ApiHandler<C>) {
  return async function route(request: Request, context: C): Promise<NextResponse> {
    const auth = await authApiKey(request);
    if (isDenied(auth)) return auth.response;

    // Keyed by the key row, not the shop: two integrations sharing a shop each
    // get their own budget, and one of them misbehaving cannot starve the other.
    const decision = consume(auth.keyId);
    const headers = rateHeaders(decision);

    if (!decision.allowed) {
      return apiError(
        "rate_limited",
        `Rate limit exceeded — ${decision.limit} requests per minute per key. Retry in ${decision.retryAfter}s.`,
        { ...headers, "Retry-After": String(decision.retryAfter) },
      );
    }

    let response: NextResponse;
    try {
      response = await handler(request, auth, context);
    } catch (error) {
      console.error("[api/v1] unhandled error:", error);
      response = apiError("server_error", "Something went wrong on our end.");
    }

    for (const [name, value] of Object.entries(headers)) {
      response.headers.set(name, value);
    }
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  };
}

/**
 * The preflight answer, exported as `OPTIONS` from every v1 route.
 *
 * Unauthenticated by necessity — a browser sends no Authorization header on a
 * preflight — and safe, because it reveals only which methods exist.
 */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
