"use server";

import QRCode from "qrcode";

import { requireUser } from "@/lib/auth";
import {
  claimScanSession,
  endScanSession,
  openScanSession,
  pairingMessage,
} from "@/lib/scan/pairing";
import { resolveScan } from "@/lib/scan/resolve";
import type { ScanResult } from "@/lib/scan/types";

/**
 * The scanner's server surface.
 *
 * A `"use server"` export is a public POST endpoint, so every function here
 * starts the same way: the shop and the user come from the session cookie and
 * nowhere else. The scanned string is the only thing that arrives from the
 * caller, and it is treated as data — matched against columns, never used to
 * pick a table, a tenant or a redirect.
 */

/** Resolves one scanned string against this shop's catalogue and paperwork. */
export async function resolveScanAction(raw: string): Promise<ScanResult> {
  const { shopId } = await requireUser();
  return resolveScan(shopId, typeof raw === "string" ? raw : "");
}

/** What the till needs to draw the pairing card. */
export type PhoneScanPairing = {
  sessionId: string;
  code: string;
  /** The URL the phone opens — also the QR's payload. */
  url: string;
  /** A `data:image/png` QR of `url`, rendered here so no library ships to the browser. */
  qrDataUrl: string;
  expiresAtISO: string;
  /**
   * False when the link points at loopback, which a phone cannot reach. The
   * dialog says so rather than showing a QR that leads nowhere.
   */
  reachable: boolean;
};

/**
 * Opens a pairing and renders its QR.
 *
 * The QR is drawn on the SERVER: `qrcode` is already a dependency for the 2FA
 * setup screen, and rendering here keeps a canvas library out of the register's
 * bundle for a picture that never changes once drawn.
 *
 * The link's origin is the till's own address by preference — that is literally
 * the URL a staff member is using, so a phone on the same wifi can reach it —
 * falling back to `NEXT_PUBLIC_APP_URL` when the till is on localhost, which no
 * other device can resolve.
 */
export async function startPhoneScanAction(input: {
  label?: string;
  /** `window.location.origin` from the till. */
  origin?: string;
}): Promise<{ ok: true; pairing: PhoneScanPairing } | { ok: false; error: string }> {
  const { shopId, userId } = await requireUser();

  const state = await openScanSession({
    shopId,
    userId,
    label: (input?.label ?? "Register").slice(0, 60),
  });

  const base = pairingOrigin(input?.origin);
  const url = `${base}/scan/${state.code}`;

  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });

  return {
    ok: true,
    pairing: {
      sessionId: state.id,
      code: state.code,
      url,
      qrDataUrl,
      expiresAtISO: state.expiresAtISO,
      reachable: !isLoopback(base),
    },
  };
}

/** Hangs up. Works from either end — both are the same user and the same shop. */
export async function endPhoneScanAction(sessionId: string): Promise<{ ok: true }> {
  const { shopId, userId } = await requireUser();
  await endScanSession({ shopId, userId, sessionId: String(sessionId) });
  return { ok: true };
}

/**
 * The phone claiming a code.
 *
 * Returns the session id it should post scans into, or the one sentence
 * explaining why it cannot.
 */
export async function pairPhoneScanAction(
  code: string,
): Promise<
  | { ok: true; sessionId: string; label: string; expiresAtISO: string }
  | { ok: false; error: string }
> {
  const { shopId, userId } = await requireUser();
  const result = await claimScanSession({
    shopId,
    userId,
    code: typeof code === "string" ? code : "",
  });

  if (!result.ok) return { ok: false, error: pairingMessage(result.problem) };

  return {
    ok: true,
    sessionId: result.state.id,
    label: result.state.label,
    expiresAtISO: result.state.expiresAtISO,
  };
}

// ---------------------------------------------------------------------------

/** Absolute origin for the QR: the till's address unless it is loopback. */
function pairingOrigin(origin?: string): string {
  const fromTill = (origin ?? "").trim().replace(/\/+$/, "");
  if (fromTill && !isLoopback(fromTill)) return fromTill;

  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (configured && !isLoopback(configured)) return configured;

  return fromTill || configured;
}

/** localhost / 127.0.0.1 / ::1 — reachable from this machine and nowhere else. */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return true;
  }
}
