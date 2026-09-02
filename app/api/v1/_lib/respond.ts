import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * The v1 response contract.
 *
 * Every collection answers with the same envelope:
 *
 *     { "data": [...], "page": 1, "totalPages": 3, "total": 118,
 *       "next_cursor": "eyJ0Ijoi…" }
 *
 * and every single resource with `{ "data": { ... } }`. Consumers can therefore
 * write one unwrapper. Errors are always
 *
 *     { "error": { "code": "not_found", "message": "..." } }
 *
 * `code` is the stable, machine-readable half — clients branch on it and the
 * strings never change. `message` is for humans and may be reworded.
 *
 * VERSIONING RULE for anything added here later: fields may be ADDED to a
 * payload in v1, never removed or retyped. A consumer that reads `data[].id`
 * today must still read it in a year.
 *
 * CORS is open (`*`) on every v1 response, with no credentials: the only
 * credential this API accepts is a bearer key the browser has to be given
 * explicitly, so `Access-Control-Allow-Origin: *` cannot be used to ride a
 * cookie the way it could on a session-authenticated endpoint. The rate-limit
 * headers are named in `Access-Control-Expose-Headers` so a browser client can
 * actually read its own budget.
 */

export const PAGE_SIZE = 50;

/** Sent on EVERY v1 response, including preflights and errors. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Expose-Headers":
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
};

function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra };
}

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "server_error";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  server_error: 500,
};

export function apiError(
  code: ErrorCode,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code], headers: baseHeaders(headers) },
  );
}

/** First zod issue, rendered as "field: message" — enough to fix the call. */
export function zodError(error: ZodError): NextResponse {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return apiError(
    "invalid_request",
    path ? `${path}: ${issue.message}` : (issue?.message ?? "Invalid request body."),
  );
}

export function apiList<T>(
  data: T[],
  meta: { page: number; total: number; nextCursor?: string | null },
): NextResponse {
  return NextResponse.json(
    {
      data,
      page: meta.page,
      totalPages: Math.max(1, Math.ceil(meta.total / PAGE_SIZE)),
      total: meta.total,
      // Present on every list, null when this is the last page. A client that
      // follows `next_cursor` never has to think about page numbers at all.
      next_cursor: meta.nextCursor ?? null,
    },
    { headers: baseHeaders() },
  );
}

export function apiItem<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: baseHeaders() });
}

/** `?page=` -> a 1-based page number. Junk and out-of-range collapse to 1. */
export function parsePage(url: URL): number {
  const raw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function skipFor(page: number): number {
  return (page - 1) * PAGE_SIZE;
}

/** Trimmed `?q=`, or undefined when absent/blank. */
export function queryParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

/**
 * Parses a JSON body, answering with `invalid_request` rather than throwing
 * when the caller sends something that is not JSON at all.
 */
export async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: apiError("invalid_request", "Body must be valid JSON."),
    };
  }
}

/**
 * A PATCH body that names no known field is refused rather than silently
 * treated as a no-op — "nothing happened and we said 200" is the hardest kind
 * of integration bug to find.
 */
export function noFieldsError(fields: readonly string[]): NextResponse {
  return apiError(
    "invalid_request",
    `Send at least one field to change: ${fields.join(", ")}.`,
  );
}
