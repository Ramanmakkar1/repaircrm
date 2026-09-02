"use client";

import * as React from "react";

import { createEngine, type BarcodeEngine, type ScanHit } from "./decoder";
import { buzz, cameraBlocker, hasCamera } from "./support";

/**
 * The camera, the decoder and the rules that sit between them.
 *
 * Everything stateful about scanning lives here so the two surfaces that use it
 * — the dialog next to a search box, and the full-screen page on a paired phone
 * — are pure presentation over the same machine, and can never drift apart on
 * the things that matter: permissions, torch, teardown and de-duplication.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR THINGS IT GUARANTEES
 * ---------------------------------------------------------------------------
 *   Honest states.     Every way a camera can fail to appear is a named state
 *                      with a sentence attached, never a black rectangle.
 *   The light goes out. Tracks are stopped when `active` goes false, on
 *                      unmount, and whenever the tab is hidden. This is the
 *                      classic bug in camera features and it is closed here,
 *                      once, rather than in each caller.
 *   One scan, once.    The same value inside `DUPLICATE_WINDOW_MS` is dropped —
 *                      a barcode sits in frame for about a second and would
 *                      otherwise read twenty times.
 *   Cheap frames.      Eight decodes a second on a downscaled canvas: faster
 *                      than a hand can move a box, and it leaves the main
 *                      thread free enough for the UI to stay smooth.
 */

/** The same code within this window is the same scan, not a new one. */
export const DUPLICATE_WINDOW_MS = 1500;

/** How often a frame is offered to the decoder. */
const FRAME_INTERVAL_MS = 125;

/** Frames are downscaled to this width before decoding — smaller is faster. */
const DECODE_WIDTH = 960;

/** How long a one-shot hit stays on screen before `onDone` fires. */
const HIT_LINGER_MS = 900;

export type CameraState =
  | { status: "starting" }
  | { status: "live" }
  | { status: "denied" }
  | { status: "insecure" }
  | { status: "no-camera" }
  | { status: "error"; message: string };

/**
 * What a caller does with a hit.
 *
 * Returning a string shows it as the confirmation line — "Added iPhone 14 Case"
 * reads better than "0123456789012" — and returning nothing leaves the raw code
 * on screen.
 */
export type ScanHandler = (
  hit: ScanHit,
) => void | string | Promise<void | string>;

export type ScannerControls = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  camera: CameraState;
  /** Shorthand for `camera.status === "live"`, which every view branches on. */
  live: boolean;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  selectDevice: (id: string) => void;
  torch: { available: boolean; on: boolean };
  toggleTorch: () => void;
  retry: () => void;
  /** Feed a code in by hand. Goes through the same duplicate guard. */
  submit: (hit: ScanHit) => void;
  /** The most recent accepted scan, for the confirmation line. */
  lastHit: { value: string; note: string } | null;
  /** How many have been accepted since this scanner became active. */
  count: number;
  /** Which decoder is running — native BarcodeDetector, or the WASM fallback. */
  engineName: "native" | "zxing" | null;
};

export function useScanner({
  active,
  continuous,
  onScan,
  onDone,
}: {
  /** False tears the camera down; true starts it. */
  active: boolean;
  /** Keep scanning after a hit. False fires `onDone` once, after a short beat. */
  continuous: boolean;
  onScan: ScanHandler;
  /** Called after a one-shot hit has been on screen long enough to read. */
  onDone?: () => void;
}): ScannerControls {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const lastHitRef = React.useRef<{ value: string; at: number } | null>(null);
  /** Bumped on every teardown, so an in-flight start knows it was superseded. */
  const runRef = React.useRef(0);

  const [camera, setCamera] = React.useState<CameraState>({ status: "starting" });
  const [engine, setEngine] = React.useState<BarcodeEngine | null>(null);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const [torch, setTorch] = React.useState({ available: false, on: false });
  const [lastHit, setLastHit] = React.useState<{ value: string; note: string } | null>(
    null,
  );
  const [count, setCount] = React.useState(0);

  // Caller props are read through refs so the decode loop never restarts merely
  // because a parent re-rendered with a fresh inline callback.
  const onScanRef = React.useRef(onScan);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onScanRef.current = onScan;
    onDoneRef.current = onDone;
  }, [onScan, onDone]);

  /** Stops every track. The only place a stream is ever torn down. */
  const stopStream = React.useCallback(() => {
    runRef.current += 1;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) for (const track of stream.getTracks()) track.stop();
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setTorch({ available: false, on: false });
  }, []);

  /**
   * Hands one accepted code to the caller.
   *
   * The duplicate guard is here rather than in the loop so a typed entry of the
   * same code moments later is caught too — the person who typed it because the
   * camera would not focus does not want it twice either.
   */
  const accept = React.useCallback(
    async (candidate: ScanHit) => {
      const value = candidate.value.trim();
      if (!value) return;

      const now = Date.now();
      const previous = lastHitRef.current;
      if (previous && previous.value === value && now - previous.at < DUPLICATE_WINDOW_MS) {
        return;
      }
      lastHitRef.current = { value, at: now };

      buzz();
      setCount((current) => current + 1);
      setLastHit({ value, note: candidate.format });

      const note = await onScanRef.current(candidate);
      if (typeof note === "string" && note) setLastHit({ value, note });

      if (!continuous) {
        // Let the hit land on screen for a beat so the person can see WHAT was
        // read, then get out of their way.
        window.setTimeout(() => onDoneRef.current?.(), HIT_LINGER_MS);
      }
    },
    [continuous],
  );
  const acceptRef = React.useRef(accept);
  React.useEffect(() => {
    acceptRef.current = accept;
  }, [accept]);

  /** Opens (or re-opens) the camera. Always called from an async context. */
  const start = React.useCallback(
    async (preferredDeviceId: string | null) => {
      stopStream();
      const run = runRef.current;

      const blocker = cameraBlocker();
      if (blocker) {
        setCamera({ status: blocker === "insecure" ? "insecure" : "no-camera" });
        return;
      }

      setCamera({ status: "starting" });

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: preferredDeviceId
            ? { deviceId: { exact: preferredDeviceId } }
            : {
                // The rear camera is the one pointed at the counter. `ideal`
                // rather than `exact` so a laptop still opens its only camera.
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        });
      } catch (error) {
        if (run === runRef.current) setCamera(cameraError(error));
        return;
      }

      if (run !== runRef.current) {
        // The scanner was torn down while the permission prompt was up.
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Autoplay can be refused before an interaction; the loop still reads
          // whatever the element has decoded.
        }
      }

      // Torch is a per-track capability, and most laptops do not have one.
      const [track] = stream.getVideoTracks();
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setTorch({ available: Boolean(capabilities?.torch), on: false });

      // Device labels are only populated once permission has been granted,
      // which is why the picker is built here and not before.
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (run === runRef.current) {
          setDevices(all.filter((device) => device.kind === "videoinput"));
          setDeviceId(track?.getSettings?.().deviceId ?? preferredDeviceId ?? null);
        }
      } catch {
        // A browser that will not enumerate simply gets no picker.
      }

      if (run === runRef.current) setCamera({ status: "live" });
    },
    [stopStream],
  );

  // The decoder is fetched in parallel with the permission prompt: on a browser
  // without BarcodeDetector that is a megabyte of WASM, and the person is busy
  // tapping "Allow" anyway.
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const built = await createEngine();
        if (!cancelled) setEngine(built);
      } catch {
        if (!cancelled) {
          setCamera({
            status: "error",
            message: "The barcode reader could not load. Type the code instead.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void (async () => {
      const blocker = cameraBlocker();
      if (blocker) {
        if (!cancelled) {
          setCamera({ status: blocker === "insecure" ? "insecure" : "no-camera" });
        }
        return;
      }
      // A desktop till has no camera at all: say so rather than prompting for a
      // permission that can never be granted.
      if (!(await hasCamera())) {
        if (!cancelled) setCamera({ status: "no-camera" });
        return;
      }
      if (!cancelled) await start(null);
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, start, stopStream]);

  /**
   * The decode loop.
   *
   * A `setTimeout` chain rather than `requestAnimationFrame`: rAF fires sixty
   * times a second and the WASM decoder takes tens of milliseconds, so it would
   * spend the whole main thread on frames nobody needs.
   */
  const live = camera.status === "live";
  React.useEffect(() => {
    if (!active || !live || !engine) return;

    let stopped = false;
    let timer = 0;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const again = () => {
        if (!stopped) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      };

      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        again();
        return;
      }

      const scale = Math.min(1, DECODE_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        again();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      engine
        .scan(canvas)
        .then((hits) => {
          const first = hits[0];
          if (!stopped && first) void acceptRef.current(first);
        })
        .catch(() => {
          // One bad frame is not a broken scanner.
        })
        .finally(again);
    };

    tick();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [active, live, engine]);

  // A backgrounded tab must not hold the camera. Chrome on Android keeps the
  // light on otherwise, which looks exactly like spyware to a shop owner.
  React.useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopStream();
      else void start(deviceId);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, deviceId, start, stopStream]);

  const toggleTorch = React.useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    void (async () => {
      const next = !torch.on;
      try {
        await track.applyConstraints({
          // `torch` is a real constraint that TypeScript's DOM types predate.
          advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
        });
        setTorch((current) => ({ ...current, on: next }));
      } catch {
        setTorch({ available: false, on: false });
      }
    })();
  }, [torch.on]);

  const selectDevice = React.useCallback(
    (id: string) => {
      setDeviceId(id);
      void start(id);
    },
    [start],
  );

  const retry = React.useCallback(() => {
    void start(deviceId);
  }, [deviceId, start]);

  const submit = React.useCallback((hit: ScanHit) => {
    void acceptRef.current(hit);
  }, []);

  return {
    videoRef,
    canvasRef,
    camera,
    live,
    devices,
    deviceId,
    selectDevice,
    torch,
    toggleTorch,
    retry,
    submit,
    lastHit,
    count,
    engineName: engine?.name ?? null,
  };
}

/** getUserMedia's failure modes, translated into the states above. */
function cameraError(error: unknown): CameraState {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { status: "denied" };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { status: "no-camera" };
  }
  if (name === "NotReadableError") {
    return {
      status: "error",
      message: "Another app is using the camera. Close it and try again.",
    };
  }
  return {
    status: "error",
    message: "The camera could not be started. Type the code instead.",
  };
}
