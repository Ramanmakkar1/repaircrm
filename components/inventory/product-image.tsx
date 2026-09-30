"use client";

import * as React from "react";
import Image from "next/image";
import { Package, Settings2, Wrench } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { productImageSource, type ProductImageInput } from "@/lib/inventory/product-images";

export function ProductImage({ name, category, imageUrl, className, sizes = "(max-width: 640px) 50vw, 280px", showFallbackLabel = false }: ProductImageInput & {
  className?: string;
  sizes?: string;
  showFallbackLabel?: boolean;
}) {
  const source = productImageSource({ name, category, imageUrl });
  const [failedSources, setFailedSources] = React.useState<string[]>([]);
  const image = source.src && !failedSources.includes(source.src) ? source : productImageSource({ name, category });
  const Icon = image.kind === "service" ? Wrench : ["part", "display", "port"].includes(image.kind) ? Settings2 : Package;

  return (
    <div className={cn("relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white", className)}>
      {image.src && !failedSources.includes(image.src) ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          className="object-contain p-2"
          // Optimisation requests cannot forward the user's cookie to /files.
          unoptimized={image.src.startsWith("/files/")}
          onError={() => { if (image.src) setFailedSources((previous) => previous.includes(image.src!) ? previous : [...previous, image.src!]); }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-3 text-muted-foreground" role="img" aria-label={`No photo for ${name}`}>
          <Icon className="size-8" strokeWidth={1.4} aria-hidden />
          {showFallbackLabel ? <span className="text-center text-xs">{image.kind === "service" ? "Service" : "No product photo"}</span> : null}
        </div>
      )}
      {showFallbackLabel && image.illustrative && image.src && !failedSources.includes(image.src) ? <span className="absolute bottom-2 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Category image</span> : null}
    </div>
  );
}
