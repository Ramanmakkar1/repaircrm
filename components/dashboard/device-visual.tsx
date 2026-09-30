"use client";

import { useState } from "react";
import { Laptop, Monitor, Smartphone, Tablet, Wrench } from "lucide-react";
import { deviceImageSource } from "@/lib/inventory/product-images";

/** Intake photographs are session-gated; a typed icon stays honest when none exists. */
export function DeviceVisual({ label, type, photoId }: { label: string; type: string; photoId?: string }) {
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
  return (
    <div className="relative flex h-[154px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-white sm:w-[120px]">
      {source && !failedSources.includes(source) ? (
        // Uploads require the signed-in session and cannot use the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={source === actual ? `Intake photo of ${label}` : `${category?.label} device illustration`} loading="lazy" onError={() => setFailedSources(previous => [...previous, source])} className="h-full w-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <device.Icon className="size-14 text-[#006aff]" strokeWidth={1.2} aria-hidden />
          <span className="text-xs">{device.name}</span>
        </div>
      )}
      {source && source !== actual && !failedSources.includes(source) ? <span className="absolute bottom-1 bg-white px-1 text-center text-[9px] text-muted-foreground">Device illustration</span> : null}
    </div>
  );
}
