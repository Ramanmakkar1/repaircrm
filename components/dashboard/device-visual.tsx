"use client";

import { useState } from "react";
import { Laptop, Monitor, Smartphone, Tablet, Wrench } from "lucide-react";

/** Intake photographs are session-gated; a typed icon stays honest when none exists. */
export function DeviceVisual({ label, type, photoId }: { label: string; type: string; photoId?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = photoId ? `/files/${photoId}` : null;
  const kind = `${type} ${label}`.toLowerCase();
  const device = /ipad|tablet/.test(kind) ? { Icon: Tablet, name: "Tablet" }
    : /iphone|galaxy|pixel|phone|smartphone|mobile/.test(kind) ? { Icon: Smartphone, name: "Phone" }
    : /macbook|laptop|notebook/.test(kind) ? { Icon: Laptop, name: "Laptop" }
    : /desktop|imac|monitor|computer|pc\b/.test(kind) ? { Icon: Monitor, name: "Computer" }
    : { Icon: Wrench, name: "Device" };
  return (
    <div className="flex h-[154px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-white sm:w-[120px]">
      {source && source !== failedSource ? (
        // Uploads require the signed-in session and cannot use the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={`Intake photo of ${label}`} loading="lazy" onError={() => setFailedSource(source)} className="h-full w-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <device.Icon className="size-14 text-[#006aff]" strokeWidth={1.2} aria-hidden />
          <span className="text-xs">{device.name}</span>
        </div>
      )}
    </div>
  );
}
