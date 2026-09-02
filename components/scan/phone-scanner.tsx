"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { endPhoneScanAction } from "@/app/(app)/scan/actions";
import { CameraView, ManualEntry } from "./camera-view";
import { useScanner } from "./use-scanner";

/**
 * The phone, working as the till's barcode gun.
 *
 * One screen, one job: a viewfinder that fills the display, a line saying which
 * till it is feeding, and a running list of what it has sent. Every code read
 * is POSTed to /api/scan/events, which the desktop is polling — so the shop
 * owner watches items appear in the cart while looking at the phone.
 *
 * ---------------------------------------------------------------------------
 * SENDING, AND WHAT HAPPENS WHEN IT FAILS
 * ---------------------------------------------------------------------------
 * A scan is not "done" when the camera reads it — it is done when the till has
 * it. So each row carries its own state: sending, sent, or a reason it did not
 * go. A 410 means the till hung up or the pairing expired, which ends the
 * session here too rather than letting somebody keep scanning into nothing.
 */

type Sent = {
  id: number;
  value: string;
  format: string;
  status: "sending" | "sent" | "failed";
  error?: string;
};

/** How many sent codes stay on screen. Older ones scroll out of memory too. */
const HISTORY = 12;

export function PhoneScanner({
  sessionId,
  label,
  code,
  expiresAtISO,
  userName,
}: {
  sessionId: string;
  /** What the till called itself, e.g. "Register". */
  label: string;
  code: string;
  expiresAtISO: string;
  userName: string;
}) {
  const [sent, setSent] = React.useState<Sent[]>([]);
  const [connected, setConnected] = React.useState(true);
  const [ended, setEnded] = React.useState<string | null>(null);
  const nextId = React.useRef(0);

  /** Posts one code to the till and records how it went. */
  const send = React.useCallback(
    async (value: string, format: string) => {
      const id = nextId.current++;
      const row: Sent = { id, value, format, status: "sending" };
      setSent((rows) => [row, ...rows].slice(0, HISTORY));

      try {
        const response = await fetch("/api/scan/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, value, format }),
        });

        if (response.ok) {
          setConnected(true);
          setSent((rows) =>
            rows.map((row) =>
              row.id === id ? { ...row, status: "sent" as const } : row,
            ),
          );
          return "Sent to the till";
        }

        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const message = body?.error ?? "The till did not accept that scan.";

        // 410 Gone: the rope is cut. Nothing else will get through either.
        if (response.status === 410 || response.status === 404) setEnded(message);
        setConnected(false);
        setSent((rows) =>
          rows.map((row) =>
            row.id === id ? { ...row, status: "failed" as const, error: message } : row,
          ),
        );
        return message;
      } catch {
        setConnected(false);
        setSent((rows) =>
          rows.map((row) =>
            row.id === id
              ? {
                  ...row,
                  status: "failed" as const,
                  error: "No connection to the till.",
                }
              : row,
          ),
        );
        return "No connection to the till";
      }
    },
    [sessionId],
  );

  const scanner = useScanner({
    active: ended === null,
    continuous: true,
    onScan: (hit) => send(hit.value, hit.format),
  });

  const disconnect = React.useCallback(() => {
    void endPhoneScanAction(sessionId);
    setEnded("You disconnected this phone.");
  }, [sessionId]);

  // date-fns rather than `toLocaleTimeString`, which renders "12:40 p.m." on
  // the server's ICU and "12:40 PM" in the browser — a hydration mismatch on a
  // page that is server-rendered before the camera ever opens.
  const expiresAt = React.useMemo(
    () => format(new Date(expiresAtISO), "h:mm a"),
    [expiresAtISO],
  );

  if (ended) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-hover text-muted-foreground">
          <ACTIONS.disconnect className="size-6" />
        </span>
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Disconnected
        </h1>
        <p className="max-w-xs text-[14px] text-muted-foreground">{ended}</p>
        <p className="text-[13px] text-faint-foreground tabular-nums">
          {sent.filter((row) => row.status === "sent").length} code
          {sent.filter((row) => row.status === "sent").length === 1 ? "" : "s"} sent
          this session.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#101418] text-white">
      {/* ------------------------------------------------------------ head */}
      <header className="flex items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            connected ? "bg-status-resolved/20 text-status-resolved" : "bg-white/10 text-white/60",
          )}
        >
          {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold leading-tight">
            Scanning for {label}
          </span>
          <span className="truncate text-[12.5px] text-white/60">
            {userName} · code {code} · until {expiresAt}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={disconnect}
          className="ml-auto shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
        >
          Disconnect
        </Button>
      </header>

      {/* ------------------------------------------------------ viewfinder */}
      <div className="relative min-h-[46vh] flex-1">
        <CameraView scanner={scanner} fill />
      </div>

      {/* ------------------------------------------------------------ sent */}
      <section className="flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/50">
            Sent to the till
          </h2>
          <span className="text-[13px] font-bold tabular-nums text-white/70">
            {sent.filter((row) => row.status === "sent").length}
          </span>
        </div>

        {sent.length === 0 ? (
          <p className="text-[13.5px] text-white/60">
            Point the camera at a barcode. Everything you scan appears on the
            till within a second.
          </p>
        ) : (
          <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
            {sent.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2.5 rounded-md bg-white/5 px-3 py-2"
              >
                {row.status === "sending" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-white/60" />
                ) : row.status === "sent" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-status-resolved" />
                ) : (
                  <WifiOff className="size-4 shrink-0 text-status-overdue" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[13px]">{row.value}</span>
                  {row.error ? (
                    <span className="truncate text-[12px] text-status-overdue">
                      {row.error}
                    </span>
                  ) : (
                    <span className="truncate text-[12px] text-white/45">
                      {row.format}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <ManualEntry
          id="phone-scan-manual"
          tone="dark"
          onSubmit={(value) => scanner.submit({ value, format: "Typed" })}
        />
      </section>
    </main>
  );
}
