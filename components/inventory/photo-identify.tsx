"use client";

import * as React from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { identifyProductAction } from "@/app/(app)/inventory/vision-actions";
import type { VoiceProductFields } from "@/app/(app)/inventory/voice-actions";

/**
 * "Photo" — snap or pick an image of a part and let a vision model name it.
 *
 * A plain file input with `capture="environment"` opens the rear camera on a
 * phone and a file picker on a laptop, so there's no camera plumbing to own. The
 * image is downscaled in the browser before upload — smaller and cheaper, and
 * the model doesn't need a 12-megapixel shelf photo to read "iPhone 6 screen".
 * The result fills the same fields the voice path does, for the human to check.
 */
export function PhotoIdentify({
  onFill,
}: {
  onFill: (fields: VoiceProductFields) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same photo be chosen again
    if (!file) return;

    setBusy(true);
    try {
      const blob = await downscale(file);
      const form = new FormData();
      form.set("image", blob, "product.jpg");
      const result = await identifyProductAction(form);
      if (result.ok) {
        // A photo names the part and its category; price and quantity stay for
        // the human to fill in.
        onFill({ ...result.fields, price: null, quantity: null });
        toast.success("Filled from photo — check the fields");
      } else {
        toast.error(result.reason);
      }
    } catch {
      toast.error("Couldn't read that photo — try again, or type it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="soft"
        size="sm"
        disabled={busy}
        aria-busy={busy}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 gap-1.5"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Camera className="size-4" aria-hidden />
        )}
        {busy ? "Reading…" : "Photo"}
      </Button>
    </>
  );
}

/** Scale the picked image down to keep the upload — and the model bill — small. */
async function downscale(file: File, max = 1024, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
  });
}
