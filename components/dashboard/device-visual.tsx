"use client";

import { useState } from "react";
import { Laptop, Monitor, Smartphone, Tablet, Wrench } from "lucide-react";
import { deviceImageSource } from "@/lib/inventory/product-images";
import { cn } from "@/components/ui/cn";

/** Smaller than this and an uploaded image is treated as missing. */
const MIN_PHOTO_SIDE = 64;

/**
 * The picture on a repair card, same size and white canvas as `PhotoVisual`
 * so a Repairs card and a Stock card line up.
 *
 * In order of preference: the real intake photo, the device-family picture
 * (laptop, phone, console... chosen from the words, never an exact model), then
 * a plain icon. Intake photographs are session-gated and cannot use the image
 * optimizer, so they are a plain <img>; if one fails to load it quietly gives
 * way to the next choice.
 */
export function DeviceVisual({ label, type, photoId, className }: { label: string; type: string; photoId?: string; className?: string }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const category = deviceImageSource(`${type} ${label}`);
  const actual = photoId ? `/files/${photoId}` : null;
  const source = actual && !failedSources.includes(actual) ? actual : category?.src ?? null;
  const kind = `${type} ${label}`.toLowerCase();
  const device = /ipad|tablet/.test(kind) ? { Icon: Tablet, name: "Tablet" }
    : /iphone|galaxy|pixel|phone|smartphone|mobile/.test(kind) ? { Icon: Smartphone, name: "Phone" }
    : /macbook|laptop|notebook/.test(kind) ? { Icon: Laptop, name: "Laptop" }
    : /desktop|imac|monitor|computer|pc\b/.test(kind) ? { Icon: Monitor, name: "Computer" }
    : { Icon: Wrench, name: "Device" };
  const giveUp = (bad: string) => setFailedSources((previous) => (previous.includes(bad) ? previous : [...previous, bad]));
  // A thumbnail too small to make out (a 32px placeholder, a tracking pixel) is not a photo of the
  // device; the family picture says more. Checked on load, and on mount for an image that finished
  // loading before this component hydrated.
  const flagTiny = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0 && Math.min(img.naturalWidth, img.naturalHeight) < MIN_PHOTO_SIDE) giveUp(img.getAttribute("src") ?? "");
  };
  const showPhoto = Boolean(source) && !failedSources.includes(source as string);
  return (
    <span className={cn("relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:size-24", showPhoto ? "bg-white" : "bg-surface-hover", className)}>
      {showPhoto ? (
        // Uploads require the signed-in session and cannot use the image optimizer.
        // The title above the picture says what it is, so the picture itself is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source as string}
          alt=""
          loading="lazy"
          ref={flagTiny}
          onError={() => giveUp(source as string)}
          onLoad={(event) => flagTiny(event.currentTarget)}
          className={cn("size-full", source === actual ? "object-cover" : "object-contain p-2")}
        />
      ) : (
        <span aria-hidden className="flex flex-col items-center gap-1 text-foreground">
          <device.Icon className="size-9" strokeWidth={1.4} />
          <span className="text-xs text-muted-foreground">{device.name}</span>
        </span>
      )}
    </span>
  );
}
