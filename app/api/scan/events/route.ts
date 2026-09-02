import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { normalizeScan } from "@/lib/scan/codes";
import {
  drainScanEvents,
  pairingMessage,
  pushScanEvent,
  type PairingProblem,
} from "@/lib/scan/pairing";

/**
 * The wire between a paired phone and the till it is scanning for.
 *
 *   GET  /api/scan/events?session=<id>&after=<seq>   the till, polling
 *   POST /api/scan/events  { sessionId, value, format }   the phone, scanning
 *
 * ---------------------------------------------------------------------------
 * WHY POLLING
 * ---------------------------------------------------------------------------
 * There is no websocket server in this stack and no Redis to fan out through,
 * and adding either for "a phone sends the till a twelve-character string" would
 * be a second piece of infrastructure to run for a feature that is idle 99% of
 * the time. So the till asks once a second while the dialog is open, backs off
 * to fifteen seconds when the tab is hidden, and stops entirely when the dialog
 * closes or the pairing ends. Each poll is one indexed lookup and one indexed
 * range scan on a table with a handful of rows in it.
 *
 * The cursor is the event's `seq`: "everything after 41". That makes the
 * transport exactly-once without an acknowledgement round trip of its own —
 * the next poll's `after` IS the acknowledgement, and the rows it passes get
 * stamped consumed.
 *
 * ---------------------------------------------------------------------------
 * TENANCY
 * ---------------------------------------------------------------------------
 * Both verbs resolve the session from the cookie and hand `shopId`+`userId`
 * into the lookup, which puts both in the `where`. A session id belonging to
 * another shop — or to a colleague in the same shop — is indistinguishable
 * from one that does not exist.
 */

/** A poll must never be answered from a cache. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  // 401 rather than requireUser()'s redirect: a `fetch` would silently follow a
  // 307 to /login and hand the poller an HTML body to JSON.parse.
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("session") ?? "").slice(0, 64);
  const after = toSeq(url.searchParams.get("after"));

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const result = await drainScanEvents({
    shopId: session.shopId,
    userId: session.userId,
    sessionId,
    after,
  });

  if (!result.ok) return problemResponse(result.problem);

  return NextResponse.json({
    paired: result.state.paired,
    label: result.state.label,
    expiresAt: result.state.expiresAtISO,
    cursor: result.cursor,
    events: result.events.map((event) => ({
      id: event.id,
      seq: event.seq,
      value: event.value,
      format: event.format,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const payload = body as { sessionId?: unknown; value?: unknown; format?: unknown };
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.slice(0, 64) : "";
  // The decoded string is outside input: cleaned, capped, and only ever stored
  // and compared (see lib/scan/codes.ts).
  const value = normalizeScan(typeof payload.value === "string" ? payload.value : "");
  const format = typeof payload.format === "string" ? payload.format : null;

  if (!sessionId || !value) {
    return NextResponse.json({ error: "Missing sessionId or value" }, { status: 400 });
  }

  const result = await pushScanEvent({
    shopId: session.shopId,
    userId: session.userId,
    sessionId,
    value,
    format,
  });

  if (!result.ok) return problemResponse(result.problem);

  return NextResponse.json({ ok: true, value, label: result.state.label });
}

// ---------------------------------------------------------------------------

/**
 * A dead pairing is 410 Gone, not 404: the phone's page is still valid, the
 * rope is not, and the difference is what lets both ends say "disconnected"
 * instead of "something went wrong".
 */
function problemResponse(problem: PairingProblem) {
  const status = problem === "not-found" ? 404 : 410;
  return NextResponse.json({ error: pairingMessage(problem), problem }, { status });
}

function toSeq(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
