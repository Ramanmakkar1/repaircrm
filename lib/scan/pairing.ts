import { randomInt } from "node:crypto";

import { db } from "@/lib/db";

/**
 * Phone-as-scanner pairing: the server half.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 * The till is a desktop with no camera; the phone in the shopkeeper's pocket
 * has a very good one. A ScanSession is the rope between them: the till makes
 * one, shows its `code` as a QR, and then polls for the barcodes the phone
 * posts into it.
 *
 * ---------------------------------------------------------------------------
 * THE TRUST RULES — all four are enforced on every call
 * ---------------------------------------------------------------------------
 *   1. Same shop.   A session only ever belongs to the shop that made it.
 *   2. Same user.   The phone must be signed in as the person who opened the
 *                   dialog. A colleague scanning into someone else's till
 *                   would ring items onto a sale they cannot see.
 *   3. Not expired. Thirty minutes, then the rope is cut.
 *   4. Not ended.   Either end can hang up, and hanging up is final.
 *
 * `shopId`/`userId` always come from the session cookie at the call site and
 * never from the request body (see lib/db.ts).
 */

/** How long a pairing lives. Long enough for a shift's worth of receiving. */
export const SCAN_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Pairing-code alphabet: no O/0, no I/1, no U (which reads as V on a phone
 * screen). Someone is going to type this by hand when the QR will not focus.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTVWXYZ23456789";
const CODE_LENGTH = 6;

/** The most events one poll hands back — a burst of scans, not a backlog. */
export const SCAN_POLL_LIMIT = 25;

/** A cryptographically random pairing code. */
function newCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** The live session as both ends need to see it. */
export type PairingState = {
  id: string;
  code: string;
  label: string;
  paired: boolean;
  ended: boolean;
  expiresAtISO: string;
};

function stateOf(row: {
  id: string;
  code: string;
  label: string;
  pairedAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date;
}): PairingState {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    paired: row.pairedAt !== null,
    ended: row.endedAt !== null,
    expiresAtISO: row.expiresAt.toISOString(),
  };
}

/**
 * Opens a pairing for one till.
 *
 * Any pairing this user already had is ended first: a person has one phone and
 * one till, and leaving orphaned sessions open would mean a scan could arrive
 * at a dialog that was closed ten minutes ago. The code retries on the
 * (astronomically unlikely) unique collision rather than failing the click.
 */
export async function openScanSession(input: {
  shopId: string;
  userId: string;
  label: string;
}): Promise<PairingState> {
  await endScanSessionsFor(input.shopId, input.userId);

  const expiresAt = new Date(Date.now() + SCAN_SESSION_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await db.scanSession.create({
        data: {
          shopId: input.shopId,
          userId: input.userId,
          code: newCode(),
          label: input.label.slice(0, 60) || "Register",
          expiresAt,
        },
        select: {
          id: true,
          code: true,
          label: true,
          pairedAt: true,
          endedAt: true,
          expiresAt: true,
        },
      });
      return stateOf(row);
    } catch (error) {
      // P2002 is the unique-code clash. Anything else is a real failure.
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }

  throw new Error("Could not allocate a pairing code.");
}

/** Ends every live pairing this user owns. Idempotent. */
export async function endScanSessionsFor(
  shopId: string,
  userId: string,
): Promise<void> {
  await db.scanSession.updateMany({
    where: { shopId, userId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

/** Ends one pairing, if it belongs to this shop and this user. */
export async function endScanSession(input: {
  shopId: string;
  userId: string;
  sessionId: string;
}): Promise<void> {
  await db.scanSession.updateMany({
    where: {
      id: input.sessionId,
      shopId: input.shopId,
      userId: input.userId,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
}

/** Why a session could not be used. Each maps to one sentence in the UI. */
export type PairingProblem = "not-found" | "expired" | "ended" | "already-paired";

export type PairingLookup =
  | { ok: true; state: PairingState }
  | { ok: false; problem: PairingProblem };

/**
 * Loads a session by id, refusing anything the caller may not touch.
 *
 * The shop AND user filters are part of the `where`, so a session belonging to
 * another tenant is indistinguishable from one that never existed.
 */
export async function loadScanSession(input: {
  shopId: string;
  userId: string;
  sessionId: string;
}): Promise<PairingLookup> {
  const row = await db.scanSession.findFirst({
    where: { id: input.sessionId, shopId: input.shopId, userId: input.userId },
    select: {
      id: true,
      code: true,
      label: true,
      pairedAt: true,
      endedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return { ok: false, problem: "not-found" };
  if (row.endedAt) return { ok: false, problem: "ended" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, problem: "expired" };
  return { ok: true, state: stateOf(row) };
}

/**
 * Claims a pairing code from the phone.
 *
 * The code is SINGLE-USE: `pairedAt` is stamped inside a conditional
 * `updateMany`, so two phones racing for the same code cannot both win — the
 * loser's update matches zero rows and it is told the code is already in use.
 * Re-opening the page on the phone that already paired is not a second claim,
 * which is why the already-paired branch checks the row again before refusing.
 */
export async function claimScanSession(input: {
  shopId: string;
  userId: string;
  code: string;
}): Promise<PairingLookup> {
  const code = input.code.trim().toUpperCase().slice(0, 16);
  if (!code) return { ok: false, problem: "not-found" };

  const row = await db.scanSession.findFirst({
    where: { code, shopId: input.shopId, userId: input.userId },
    select: {
      id: true,
      code: true,
      label: true,
      pairedAt: true,
      endedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return { ok: false, problem: "not-found" };
  if (row.endedAt) return { ok: false, problem: "ended" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, problem: "expired" };

  if (row.pairedAt) {
    // Already ours and already claimed — a reload, not a second phone.
    return { ok: true, state: stateOf(row) };
  }

  const claimed = await db.scanSession.updateMany({
    where: { id: row.id, shopId: input.shopId, userId: input.userId, pairedAt: null },
    data: { pairedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, problem: "already-paired" };

  return { ok: true, state: { ...stateOf(row), paired: true } };
}

/**
 * Records one barcode the phone read.
 *
 * The session is re-validated here rather than trusted from the phone's page
 * load: half an hour is long enough for the till to have closed the dialog.
 */
export async function pushScanEvent(input: {
  shopId: string;
  userId: string;
  sessionId: string;
  value: string;
  format: string | null;
}): Promise<PairingLookup> {
  const found = await loadScanSession(input);
  if (!found.ok) return found;

  await db.scanEvent.create({
    data: {
      sessionId: found.state.id,
      shopId: input.shopId,
      value: input.value,
      format: input.format?.slice(0, 40) ?? null,
    },
  });

  return found;
}

/** One scan on its way to the till. */
export type ScanEventRow = { id: string; seq: number; value: string; format: string | null };

/**
 * The till's poll: everything after the cursor it last consumed.
 *
 * The cursor is `seq` — a plain autoincrement — so acknowledging is just
 * "here's the highest number I've dealt with", one integer instead of a list of
 * ids. Rows at or below it are stamped consumed, which is bookkeeping the
 * housekeeping sweep and any future debugging can read.
 */
export async function drainScanEvents(input: {
  shopId: string;
  userId: string;
  sessionId: string;
  after: number;
}): Promise<
  | { ok: true; state: PairingState; events: ScanEventRow[]; cursor: number }
  | { ok: false; problem: PairingProblem }
> {
  const found = await loadScanSession(input);
  if (!found.ok) return found;

  if (input.after > 0) {
    await db.scanEvent.updateMany({
      where: { sessionId: found.state.id, seq: { lte: input.after }, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  const events = await db.scanEvent.findMany({
    where: { sessionId: found.state.id, seq: { gt: input.after } },
    orderBy: { seq: "asc" },
    take: SCAN_POLL_LIMIT,
    select: { id: true, seq: true, value: true, format: true },
  });

  return {
    ok: true,
    state: found.state,
    events,
    cursor: events.length > 0 ? events[events.length - 1].seq : input.after,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** One plain sentence per failure, shared by the phone page and the till. */
export function pairingMessage(problem: PairingProblem): string {
  switch (problem) {
    case "expired":
      return "That pairing has expired. Open a new one on the till.";
    case "ended":
      return "That till has disconnected. Open a new pairing on it.";
    case "already-paired":
      return "That code is already being used by another phone.";
    default:
      return "That pairing code is not valid for your account.";
  }
}
