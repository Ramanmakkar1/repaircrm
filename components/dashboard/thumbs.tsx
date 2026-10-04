import Image from "next/image";
import { Package, Wrench } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { InitialsVisual } from "@/components/ui/record-card";
import { deviceImageSource, productImageSource } from "@/lib/inventory/product-images";
import type { DeviceRef, NeedsYouVisual } from "@/lib/dashboard/logic";

/**
 * Small pictures for the overview. Server components with no client code: the
 * overview draws a dozen of them, and the repair card's DeviceVisual (a client
 * component that swaps pictures on error) is more than a thumbnail needs.
 *
 * Every picture is decorative (the words next to it say what it is) and sits on
 * a white canvas, because the catalog photos are shot on white in every theme.
 */

const FRAME = "relative block shrink-0 overflow-hidden rounded-xl border border-border bg-white";

/** The picture of a device family (phone, laptop, console...), never an exact model. */
export function DeviceThumb({ device, className }: { device: DeviceRef | null; className?: string }) {
  const source = device ? deviceImageSource([device.type, device.make, device.model].filter(Boolean).join(" ")) : null;
  return (
    <span aria-hidden className={cn(FRAME, !source && "bg-surface-hover", className ?? "size-14")}>
      {source ? (
        <Image src={source.src} alt="" fill sizes="64px" className="object-contain p-1" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Wrench className="size-1/2" strokeWidth={1.5} />
        </span>
      )}
    </span>
  );
}

/** A product's own photo, else its catalog picture, else a plain box. Shown on white. */
export function ProductThumb({
  name,
  category,
  catalogImage,
  imageUrl,
  className,
}: {
  name: string;
  category?: string | null;
  catalogImage?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  const source = productImageSource({ name, category, catalogImage, imageUrl });
  return (
    <span aria-hidden className={cn(FRAME, !source.src && "bg-surface-hover", className ?? "size-14")}>
      {source.src ? (
        // A product photo lives behind the session (/files/...), which the image optimiser cannot read.
        <Image src={source.src} alt="" fill sizes="64px" unoptimized={source.src.startsWith("/files/")} className="object-contain p-1" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Package className="size-1/2" strokeWidth={1.5} />
        </span>
      )}
    </span>
  );
}

/** The picture on a "needs you" row: a device, a product, or a person's initials. */
export function RowVisual({ visual }: { visual: NeedsYouVisual }) {
  if (visual.kind === "device") return <DeviceThumb device={visual.device} />;
  if (visual.kind === "product") {
    return <ProductThumb name={visual.name} category={visual.category} catalogImage={visual.catalogImage} imageUrl={visual.imageUrl} />;
  }
  return <InitialsVisual name={visual.name} className="size-14 text-lg sm:size-14 sm:text-lg" />;
}
