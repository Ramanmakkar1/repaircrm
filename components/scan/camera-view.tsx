"use client";

import * as React from "react";
import {
  Camera,
  CameraOff,
  Keyboard,
  Lightbulb,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import type { CameraState, ScannerControls } from "./use-scanner";

/**
 * The viewfinder: video, framing guide, torch, camera picker, and one plain
 * sentence for every way a camera can fail to appear.
 *
 * Pure presentation over `useScanner` — it holds no state of its own — so the
 * dialog beside a search box and the full-screen page on a paired phone look
 * and behave identically. The camera viewport is the one dark surface in an
 * otherwise white app, because a preview on white looks like a mistake.
 */
export function CameraView({
  scanner,
  className,
  /**
   * Fills its container instead of holding a 4:3 box. Used by the phone page.
   *
   * Absolute rather than `h-full`: the container is a flex item whose height
   * comes from `flex-1`, and a percentage height against that collapses to
   * zero in a flex column — which silently hid the whole viewfinder.
   */
  fill = false,
}: {
  scanner: ScannerControls;
  className?: string;
  fill?: boolean;
}) {
  const { camera, live, videoRef, canvasRef, devices, deviceId, torch } = scanner;

  return (
    <div
      className={cn(
        "isolate overflow-hidden bg-[#101418]",
        fill ? "absolute inset-0" : "relative rounded-xl",
        className,
      )}
    >
      <div className={cn("relative w-full", fill ? "h-full" : "aspect-[4/3]")}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-200",
            live ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Frames are drawn here before decoding; never shown. */}
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {live ? (
          <FramingGuide found={Boolean(scanner.lastHit)} />
        ) : (
          <CameraMessage state={camera} onRetry={scanner.retry} />
        )}
      </div>

      {live ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
          {torch.available ? (
            <button
              type="button"
              onClick={scanner.toggleTorch}
              aria-pressed={torch.on}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold backdrop-blur transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                torch.on ? "bg-white text-[#101418]" : "bg-white/15 text-white hover:bg-white/25",
              )}
            >
              <Lightbulb className="size-4" />
              {torch.on ? "Light on" : "Light"}
            </button>
          ) : (
            <span />
          )}

          {/* Only worth showing when there is genuinely a choice to make. */}
          {devices.length > 1 ? (
            <label className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-3.5 text-[13.5px] font-semibold text-white backdrop-blur">
              <Camera className="size-4 shrink-0" />
              <span className="sr-only">Camera</span>
              <select
                value={deviceId ?? ""}
                onChange={(event) => scanner.selectDevice(event.target.value)}
                aria-label="Choose a camera"
                className="max-w-[9rem] truncate bg-transparent pr-1 text-white outline-none [&>option]:text-foreground"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The framing rectangle and its sweep line — the "aim here" affordance. */
function FramingGuide({ found }: { found: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          "absolute left-[8%] right-[8%] top-1/2 h-[42%] -translate-y-1/2 rounded-lg border-2 transition-colors duration-200",
          found ? "border-status-resolved" : "border-white/70",
        )}
      >
        {found ? null : (
          <span className="absolute inset-x-3 top-1/2 h-px bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
        )}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]" />
    </div>
  );
}

/**
 * Every non-live state, said plainly.
 *
 * Each of these is a thing a shop owner can act on: allow the permission, use
 * https, or use the phone instead. None of them is "something went wrong".
 */
function CameraMessage({
  state,
  onRetry,
}: {
  state: CameraState;
  onRetry: () => void;
}) {
  if (state.status === "starting") {
    return (
      <Shade>
        <Loader2 className="size-6 animate-spin" />
        <p className="text-[13.5px] font-medium">Asking for the camera…</p>
      </Shade>
    );
  }

  if (state.status === "denied") {
    return (
      <Shade>
        <CameraOff className="size-6" />
        <p className="text-[13.5px] font-semibold">Camera permission is blocked</p>
        <p className="max-w-[19rem] text-[12.5px] text-white/70">
          Tap the padlock (or the camera icon) in the address bar, allow the
          camera for this site, then try again.
        </p>
        <ShadeButton onClick={onRetry}>
          <RefreshCw className="size-4" />
          Try again
        </ShadeButton>
      </Shade>
    );
  }

  if (state.status === "insecure") {
    return (
      <Shade>
        <Lock className="size-6" />
        <p className="text-[13.5px] font-semibold">This needs HTTPS</p>
        <p className="max-w-[19rem] text-[12.5px] text-white/70">
          Browsers only hand over the camera on a secure address. Open
          RepairFlow over https — or on this machine&apos;s own localhost — and
          the scanner will work. You can still type the code in.
        </p>
      </Shade>
    );
  }

  if (state.status === "no-camera") {
    return (
      <Shade>
        <CameraOff className="size-6" />
        <p className="text-[13.5px] font-semibold">No camera on this device</p>
        <p className="max-w-[19rem] text-[12.5px] text-white/70">
          Type the code in, or use “Use my phone as a scanner” on the register.
        </p>
      </Shade>
    );
  }

  if (state.status !== "error") return null;

  return (
    <Shade>
      <CameraOff className="size-6" />
      <p className="max-w-[19rem] text-[13.5px] font-medium">{state.message}</p>
      <ShadeButton onClick={onRetry}>
        <RefreshCw className="size-4" />
        Try again
      </ShadeButton>
    </Shade>
  );
}

function Shade({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-white">
      {children}
    </div>
  );
}

function ShadeButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-[13.5px] font-semibold text-[#101418] transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The way through when the camera will not cooperate.
 *
 * Present in every state, including the working one: a scuffed label, a
 * reflective bag or a code printed too small are all ordinary, and the answer
 * to each is to read it with your eyes and type it.
 */
export function ManualEntry({
  onSubmit,
  id = "scan-manual",
  tone = "light",
}: {
  onSubmit: (value: string) => void;
  id?: string;
  /** "dark" for the phone's black chrome; "light" inside a white card. */
  tone?: "light" | "dark";
}) {
  const [value, setValue] = React.useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const code = value.trim();
        if (!code) return;
        setValue("");
        onSubmit(code);
      }}
      className="flex flex-col gap-2"
    >
      <label
        htmlFor={id}
        className={cn(
          "flex items-center gap-1.5 text-[13px] font-semibold",
          tone === "dark" ? "text-white/70" : "text-muted-foreground",
        )}
      >
        <Keyboard className="size-4" />
        Type it instead
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter the code by hand"
          className={cn(
            "font-mono",
            tone === "dark" &&
              "border-white/25 bg-white/10 text-white placeholder:text-white/40",
          )}
        />
        <Button type="submit" disabled={value.trim() === ""}>
          Use
        </Button>
      </div>
    </form>
  );
}
