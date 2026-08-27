import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * The v1 response contract.
 *
 * Every collection answers with the same envelope:
 *
 *     { "data": [...], "page": 1, "totalPages": 3, "total": 118 }
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
 * NOT IMPLEMENTED (future work, called out rather than half-built):
 *   - rate limiting / quotas per key
 *   - CORS headers (the API is server-to-server today; no browser origin is
 *     allowed, which is the safe default rather than an oversight)
 *   - cursor pagination for large collections
 *   - webhooks
 */

export const PAGE_SIZE = 50;

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "server_error";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  server_error: 500,
};

export function apiError(code: ErrorCode, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
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
  meta: { page: number; total: number },
): NextResponse {
  return NextResponse.json(
    {
      data,
      page: meta.page,
      totalPages: Math.max(1, Math.ceil(meta.total / PAGE_SIZE)),
      total: meta.total,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function apiItem<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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
