"use client";

import * as React from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Camera support can't change for the life of the page, so there is nothing
 *  to subscribe to. Hoisted to a constant so the store identity is stable. */
const NO_SUBSCRIBE = () => () => {};

/**
 * "Take photo" — a webcam straight into the ticket.
 *
 * The intake photo is the single most useful attachment a repair shop has (it
 * is the answer to "that scratch was already there"), and the friction of
 * phone → cable → desktop → upload is exactly why it usually doesn't get taken.
 *
 * The camera is only opened while this dialog is open, and every track is
 * stopped on close — nothing keeps the recording light on after the user is
 * done. The button hides itself entirely when `getUserMedia` isn't available
 * (no camera, or a page not served over HTTPS/localhost), rather than offering
 * a control that can only fail.
 */
export function PhotoCaptureDialog({
  onCapture,
  disabled,
}: {
  onCapture: (file: File) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Feature detection via useSyncExternalStore rather than an effect: the
  // server has no `navigator`, so the server snapshot is a flat `false` and the
  // client snapshot is the real answer. React handles the hydration swap, and
  // there is no cascading render from a setState in an effect body.
  const supported = React.useSyncExternalStore(
    NO_SUBSCRIBE,
    () => typeof navigator.mediaDevices?.getUserMedia === "function",
    () => false,
  );

  // Genuine external-system sync, which is what effects are actually for: the
  // <video> element only exists once the dialog content has mounted, and the
  // camera has to be released when it unmounts.
  React.useEffect(() => {
    if (!open) return;

    // Nothing is set synchronously here — resetting `error`/`ready` belongs to
    // the open event (see handleOpenChange), and everything below only calls
    // setState from a promise callback once the camera has actually answered.
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        // Prefer the rear camera on a tablet at the counter; a laptop with only
        // a front camera ignores this rather than failing.
        video: { facingMode: "environment" },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(
          reason instanceof DOMException && reason.name === "NotAllowedError"
            ? "The browser blocked camera access. Allow it for this site and try again."
            : "No camera was available.",
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      // JPEG at 0.9: a counter photo of a cracked screen does not need PNG, and
      // a 6MB lossless frame would eat most of the per-file budget.
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );

    if (!blob) {
      toast.error("The photo didn't capture — try again.");
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    onCapture(new File([blob], `photo-${stamp}.jpg`, { type: "image/jpeg" }));
    setOpen(false);
  }

  /** Opening is what resets the previous attempt — not an effect watching it. */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setReady(false);
    }
  }

  if (!supported) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Camera className="size-4" />
          Take photo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>
            The photo attaches to this ticket as soon as you capture it.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive-soft px-3.5 py-2.5 text-[13.5px] text-destructive"
          >
            {error}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface-hover">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full object-cover"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!ready || Boolean(error)}
            onClick={() => void capture()}
          >
            <Camera className="size-4" />
            Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
