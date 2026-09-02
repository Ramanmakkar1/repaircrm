/**
 * The wall-clock reading for the current render.
 *
 * A Server Component renders once per request, so "what time is it right now?"
 * is a perfectly well-defined question there — but a bare `Date.now()` in a
 * component body reads identically to one in a client re-render, which is the
 * impurity React's render rules exist to catch. Taking the reading through a
 * named helper says the clock read is deliberate and request-scoped.
 *
 * Server-only by intent: a Client Component that calls this during render will
 * disagree with the markup the server sent and fail to hydrate cleanly.
 */
export function requestNow(): number {
  return Date.now();
}
