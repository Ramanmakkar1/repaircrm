/**
 * Cursor (keyset) pagination for /api/v1 collections.
 *
 * WHY BOTH THIS AND `?page=`
 * --------------------------
 * `?page=` is what a human reaches for with curl, and it still works exactly as
 * it did. But `skip` gets slower the deeper you go, and — worse — a row created
 * while a client is walking pages shifts every later page by one, so an
 * offset-paged export silently drops a record. A cursor is a position in the
 * data rather than a count of rows behind it, so neither happens.
 *
 * THE CURSOR ITSELF is base64 of `<createdAt ISO>|<id>` — the exact sort key
 * every list uses. It is opaque by contract: clients must pass back what they
 * were given and must not parse it. Base64 rather than encryption because it
 * contains nothing secret; a caller who decodes it learns the id of a row they
 * were just handed.
 *
 * Every list orders by `createdAt DESC, id DESC`. The id is the tiebreak that
 * makes the order TOTAL — two rows created in the same millisecond would
 * otherwise be free to swap places between requests, and a cursor sitting
 * between them would skip or repeat one.
 */

export type CursorPosition = { createdAt: Date; id: string };

export function encodeCursor(row: CursorPosition): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString(
    "base64url",
  );
}

export type CursorParse =
  | { ok: true; cursor: CursorPosition | null }
  | { ok: false; message: string };

/** Reads `?cursor=`. Absent is fine; malformed is a caller error, not a guess. */
export function parseCursor(url: URL): CursorParse {
  const raw = url.searchParams.get("cursor")?.trim();
  if (!raw) return { ok: true, cursor: null };

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return { ok: false, message: "cursor is not a valid cursor value." };
  }

  const separator = decoded.indexOf("|");
  if (separator < 0) {
    return { ok: false, message: "cursor is not a valid cursor value." };
  }

  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) {
    return { ok: false, message: "cursor is not a valid cursor value." };
  }

  return { ok: true, cursor: { createdAt, id } };
}

/**
 * The `where` fragment that resumes after a cursor, for a `createdAt DESC,
 * id DESC` ordering: strictly older, or the same instant with a smaller id.
 */
export function cursorWhere(cursor: CursorPosition | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** The shared ordering. Exported so no list can accidentally disagree with it. */
export const CURSOR_ORDER = [
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

/**
 * The cursor to hand back, or null when this was the last page.
 *
 * A short page is the end of the collection; a full page might be, but saying
 * so would cost an extra query, and a client that follows one more cursor to
 * an empty page has lost nothing.
 */
export function nextCursorFor(
  rows: readonly CursorPosition[],
  pageSize: number,
): string | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return last ? encodeCursor(last) : null;
}
