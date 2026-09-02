import type { NextResponse } from "next/server";

import {
  CURSOR_ORDER,
  cursorWhere,
  nextCursorFor,
  parseCursor,
  type CursorPosition,
} from "./cursor";
import { apiError, apiList, PAGE_SIZE, parsePage, skipFor } from "./respond";

/**
 * The shared shape of every v1 collection endpoint.
 *
 * TWO PAGINATION MODES, ONE ORDERING. Whether the caller sends `?page=` or
 * `?cursor=`, rows come back newest-first by `createdAt` with `id` as the
 * tiebreak. That is what lets the two modes coexist: a cursor is a position in
 * exactly the sequence the page numbers walk, so a client can start with
 * `?page=1` in a terminal and switch to cursors in code without the data
 * shifting under it.
 *
 * `?cursor=` wins when both are sent, because a cursor is a more precise
 * instruction than a page number and silently ignoring it would resend page 1
 * forever.
 */
export type ListPlan = {
  page: number;
  /** Spread into the model's `where`. Empty in page mode. */
  where: Record<string, unknown>;
  orderBy: typeof CURSOR_ORDER;
  take: number;
  /** Set in page mode only; `undefined` means "resume from the cursor". */
  skip: number | undefined;
  cursorMode: boolean;
};

export function planList(
  url: URL,
): { ok: true; plan: ListPlan } | { ok: false; response: NextResponse } {
  const parsed = parseCursor(url);
  if (!parsed.ok) {
    return { ok: false, response: apiError("invalid_request", parsed.message) };
  }

  const page = parsePage(url);
  const cursorMode = parsed.cursor !== null;

  return {
    ok: true,
    plan: {
      page,
      where: cursorMode ? cursorWhere(parsed.cursor) : {},
      orderBy: CURSOR_ORDER,
      take: PAGE_SIZE,
      skip: cursorMode ? undefined : skipFor(page),
      cursorMode,
    },
  };
}

/** Wraps the rows in the envelope, attaching the cursor for the next page. */
export function listResponse<Row extends CursorPosition, Out>(
  rows: Row[],
  serialise: (row: Row) => Out,
  plan: ListPlan,
  total: number,
): NextResponse {
  return apiList(rows.map(serialise), {
    page: plan.page,
    total,
    nextCursor: nextCursorFor(rows, plan.take),
  });
}
