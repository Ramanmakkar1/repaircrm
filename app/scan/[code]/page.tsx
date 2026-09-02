import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";

import { PhoneScanner } from "@/components/scan/phone-scanner";
import { getSession } from "@/lib/auth";
import { claimScanSession, pairingMessage } from "@/lib/scan/pairing";

export const metadata: Metadata = { title: "Scan · RepairFlow" };

/** A phone held in one hand: no zooming, and the viewfinder fills the screen. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#101418",
};

/** Pairing state is per-request; nothing here may be cached. */
export const dynamic = "force-dynamic";

/**
 * The phone half of "use my phone as a scanner".
 *
 * The till showed a QR of this URL; opening it here claims the pairing and
 * drops straight into a full-screen camera. Every code read is posted to the
 * till, which is polling for them (app/api/scan/events).
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES OUTSIDE THE (app) GROUP
 * ---------------------------------------------------------------------------
 * Same reason the print sheets do: this is one screen with one job, and the
 * sidebar, topbar and branch switcher would eat half a phone's display for
 * navigation nobody wants mid-scan. It is exactly as protected — the session is
 * checked right here, and a signed-out phone is sent to /login with `next` set
 * so signing in lands back on this pairing rather than on the dashboard.
 *
 * The claim happens on the SERVER, before anything renders, so a code that is
 * expired, already taken or from another shop shows a sentence rather than a
 * camera that would have had nowhere to send its scans.
 */
export default async function PhoneScanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/scan/${code}`)}`);
  }

  const claim = await claimScanSession({
    shopId: session.shopId,
    userId: session.userId,
    code,
  });

  if (!claim.ok) {
    return (
      <PairingProblem
        message={pairingMessage(claim.problem)}
        code={code.toUpperCase()}
      />
    );
  }

  return (
    <PhoneScanner
      sessionId={claim.state.id}
      label={claim.state.label}
      code={claim.state.code}
      expiresAtISO={claim.state.expiresAtISO}
      userName={session.name}
    />
  );
}

/** The one screen a bad code gets: what went wrong, and what to do next. */
function PairingProblem({ message, code }: { message: string; code: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span className="rounded-full bg-status-overdue-bg px-3 py-1 font-mono text-[13px] font-semibold text-status-overdue-fg">
        {code}
      </span>
      <h1 className="text-lg font-bold tracking-tight text-foreground">
        This pairing is not usable
      </h1>
      <p className="max-w-xs text-[14px] text-muted-foreground">{message}</p>
      <a
        href="/pos"
        className="mt-2 inline-flex h-11 items-center rounded-md bg-accent px-5 text-[14px] font-semibold text-accent-foreground"
      >
        Open the register
      </a>
    </main>
  );
}
