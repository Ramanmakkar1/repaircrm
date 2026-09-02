"use client";

import * as React from "react";
import { format } from "date-fns";
/* eslint-disable @next/next/no-img-element -- a data: URL QR is not an asset next/image can optimise */
import {
  CheckCircle2,
  Loader2,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import {
  endPhoneScanAction,
  startPhoneScanAction,
  type PhoneScanPairing,
} from "@/app/(app)/scan/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Use my phone as a scanner" — the till's half.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * The counter machine is a desktop with no camera. The phone in the owner's
 * pocket has an excellent one. This dialog shows a QR (and a six-character code
 * for anyone whose camera app is being difficult), the phone opens it, and from
 * then on every barcode the phone reads lands in this browser about a second
 * later — which is as close to real hardware as a web app gets without asking
 * the shop to buy anything.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSPORT, AND ITS LIMITS
 * ---------------------------------------------------------------------------
 * There is no websocket server in this stack and no Redis, so this polls
 * /api/scan/events once a second while the dialog is open, backing off to
 * fifteen seconds when the tab is hidden and stopping altogether when the
 * dialog closes or the pairing dies. The cursor it sends IS its acknowledgement
 * of everything before it, so nothing is delivered twice and nothing is lost to
 * a dropped response. The cost of the choice is honest: a scan can take up to
 * about a second to appear, and the pairing lasts thirty minutes.
 */

/** How often the till asks, with the dialog in front of somebody. */
const POLL_MS = 1000;

/** How often it asks when the tab is in the background. */
const IDLE_POLL_MS = 15_000;

type Phase =
  | { status: "starting" }
  | { status: "waiting"; pairing: PhoneScanPairing }
  | { status: "connected"; pairing: PhoneScanPairing }
  | { status: "ended"; message: string }
  | { status: "error"; message: string };

export function PhoneScanDialog({
  open,
  onOpenChange,
  onScan,
  label = "Register",
  title = "Use my phone as a scanner",
  description = "Point your phone's camera at this code. Everything it scans lands here.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once per code the phone sends, in the order they were scanned. */
  onScan: (value: string) => void;
  /** What the phone will call this till. */
  label?: string;
  title?: string;
  description?: string;
}) {
  const [phase, setPhase] = React.useState<Phase>({ status: "starting" });
  const [received, setReceived] = React.useState<string[]>([]);

  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // ---- open a pairing ------------------------------------------------------
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setPhase({ status: "starting" });
      setReceived([]);
      try {
        const result = await startPhoneScanAction({
          label,
          origin: window.location.origin,
        });
        if (cancelled) return;
        setPhase(
          result.ok
            ? { status: "waiting", pairing: result.pairing }
            : { status: "error", message: result.error },
        );
      } catch {
        if (!cancelled) {
          setPhase({
            status: "error",
            message: "Could not open a pairing. Try again in a moment.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, label]);

  const sessionId =
    phase.status === "waiting" || phase.status === "connected"
      ? phase.pairing.sessionId
      : null;

  // ---- hang up when the dialog closes -------------------------------------
  // Kept apart from the poll so closing the dialog cuts the rope exactly once,
  // rather than on every poll tick that happens to unmount.
  React.useEffect(() => {
    if (!sessionId) return;
    return () => {
      void endPhoneScanAction(sessionId);
    };
  }, [sessionId]);

  // ---- poll ----------------------------------------------------------------
  React.useEffect(() => {
    if (!open || !sessionId) return;

    let stopped = false;
    let timer = 0;
    let cursor = 0;

    const tick = async () => {
      if (stopped) return;
      try {
        const response = await fetch(
          `/api/scan/events?session=${encodeURIComponent(sessionId)}&after=${cursor}`,
          { cache: "no-store" },
        );

        if (response.status === 410 || response.status === 404) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (!stopped) {
            setPhase({
              status: "ended",
              message: body?.error ?? "The pairing has ended.",
            });
          }
          return;
        }

        if (response.ok) {
          const body = (await response.json()) as {
            paired: boolean;
            cursor: number;
            events: { value: string }[];
          };
          if (stopped) return;

          cursor = body.cursor;

          if (body.paired) {
            setPhase((current) =>
              current.status === "waiting"
                ? { status: "connected", pairing: current.pairing }
                : current,
            );
          }

          for (const event of body.events) {
            onScanRef.current(event.value);
          }
          if (body.events.length > 0) {
            setReceived((rows) =>
              [...body.events.map((event) => event.value), ...rows].slice(0, 8),
            );
          }
        }
      } catch {
        // A dropped poll is not a dropped pairing — the next one will catch up,
        // because the cursor has not moved.
      }

      if (!stopped) {
        const wait = document.visibilityState === "hidden" ? IDLE_POLL_MS : POLL_MS;
        timer = window.setTimeout(() => void tick(), wait);
      }
    };

    void tick();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [open, sessionId]);

  // ------------------------------------------------------------------ render

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {phase.status === "starting" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-[13.5px] font-medium">Opening a pairing…</p>
          </div>
        ) : null}

        {phase.status === "error" || phase.status === "ended" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-hover text-muted-foreground">
              {phase.status === "ended" ? (
                <ACTIONS.disconnect className="size-5" />
              ) : (
                <TriangleAlert className="size-5" />
              )}
            </span>
            <p className="max-w-xs text-[14px] text-muted-foreground">
              {phase.message}
            </p>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : null}

        {phase.status === "waiting" || phase.status === "connected" ? (
          <div className="flex flex-col gap-4">
            <ConnectionState
              connected={phase.status === "connected"}
              count={received.length}
            />

            {phase.pairing.reachable ? null : (
              <p className="rounded-md border border-status-in-progress/30 bg-status-in-progress-bg px-3.5 py-2.5 text-[13px] font-medium text-status-in-progress-fg">
                This till is on <span className="font-mono">localhost</span>, which
                a phone cannot reach. Set NEXT_PUBLIC_APP_URL to an address the
                phone can open, or use RepairFlow from the shop&apos;s own URL.
              </p>
            )}

            <div className="flex flex-col items-center gap-3">
              <img
                src={phase.pairing.qrDataUrl}
                alt={`QR code linking to ${phase.pairing.url}`}
                width={200}
                height={200}
                className="rounded-lg border border-border bg-white p-2"
              />
              <p className="text-center text-[13px] text-muted-foreground">
                Or open{" "}
                <span className="font-mono text-foreground">
                  {shortUrl(phase.pairing.url)}
                </span>{" "}
                and enter
              </p>
              <p className="font-mono text-[26px] font-bold tracking-[0.28em] text-foreground">
                {phase.pairing.code}
              </p>
            </div>

            {received.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-hover px-3.5 py-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Just scanned
                </span>
                <ul className="flex flex-col gap-1">
                  {received.map((value, index) => (
                    <li
                      key={`${value}-${index}`}
                      className="truncate font-mono text-[13px] text-foreground"
                    >
                      {value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] text-faint-foreground">
                Pairing ends {expiryLabel(phase.pairing.expiresAtISO)}.
              </p>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <ACTIONS.disconnect />
                Disconnect
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function ConnectionState({
  connected,
  count,
}: {
  connected: boolean;
  count: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3.5 py-3",
        connected
          ? "border-status-resolved/30 bg-status-resolved-bg"
          : "border-border bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          connected
            ? "bg-status-resolved/15 text-status-resolved-fg"
            : "bg-surface text-muted-foreground",
        )}
      >
        {connected ? (
          <CheckCircle2 className="size-[18px]" />
        ) : (
          <Smartphone className="size-[18px]" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-[14px] font-bold",
            connected ? "text-status-resolved-fg" : "text-foreground",
          )}
        >
          {connected ? "Phone connected — scan away" : "Waiting for your phone…"}
        </span>
        <span
          className={cn(
            "text-[12.5px]",
            connected ? "text-status-resolved-fg/80" : "text-muted-foreground",
          )}
        >
          {connected
            ? count > 0
              ? `${count} code${count === 1 ? "" : "s"} received so far.`
              : "Point it at a barcode."
            : "Scan the code below with the phone's camera."}
        </span>
      </span>
    </div>
  );
}

/** "example.com/scan/ABC123" — the origin without its scheme. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** "at 4:35 PM" — a time a person can compare against the clock on the wall. */
function expiryLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "in half an hour";
  return `at ${format(at, "h:mm a")}`;
}
