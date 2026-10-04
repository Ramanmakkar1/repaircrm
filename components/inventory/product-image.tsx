"use client";

import * as React from "react";
import Image from "next/image";
import { Package, Settings2, Wrench } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { productImageSource, type ProductImageInput } from "@/lib/inventory/product-images";
import type { AutomaticPhotoResult as AutomaticPhotoResponse } from "@/lib/inventory/automatic-photo-types";

// Share a lookup between catalog and cart thumbnails; misses also get a cooldown.
const lookups = new Map<string, { promise: Promise<AutomaticPhotoResponse | null>; expires: number }>();
let active = 0;
const waiting: (() => void)[] = [];
async function lookup(productId: string, key: string): Promise<AutomaticPhotoResponse | null> {
  const cached = lookups.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const entry = { expires: Date.now() + 60_000, promise: Promise.resolve(null) as Promise<AutomaticPhotoResponse | null> };
  entry.promise = (async () => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try {
      const response = await fetch(`/inventory/${productId}/photo/automatic`, { method: "POST" });
      if (!response.ok) return null;
      const result: AutomaticPhotoResponse = await response.json();
      if (!result.ok) return null;
      entry.expires = result.status === "ready" ? Date.now() + 86_400_000 : Math.max(Date.now() + (result.status === "pending" ? 1000 : 60_000), result.retryAt ? Date.parse(result.retryAt) : Date.now() + 3_600_000);
      return result;
    } catch { return null; }
    finally { active--; waiting.shift()?.(); }
  })();
  lookups.set(key, entry);
  if (lookups.size > 500) lookups.delete(lookups.keys().next().value!);
  return entry.promise;
}

export function ProductImage({ productId, name, category, imageUrl, catalogImage, className, sizes = "(max-width: 640px) 50vw, 280px", showFallbackLabel = false, showAttributionLinks = false, photoRevision = 0, onAutomaticReady }: ProductImageInput & {
  className?: string;
  sizes?: string;
  showFallbackLabel?: boolean;
  showAttributionLinks?: boolean;
  photoRevision?: number;
  onAutomaticReady?: (ready: boolean) => void;
}) {
  const frame = React.useRef<HTMLDivElement>(null);
  const [automatic, setAutomatic] = React.useState<{ key: string; result: AutomaticPhotoResponse } | null>(null);
  const key = `${productId ?? ""}:${name}:${category ?? ""}:${catalogImage ?? ""}:${photoRevision}`;
  const source = productImageSource({ name, category, imageUrl, catalogImage });
  React.useEffect(() => {
    if (!productId || source.src) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const start = () => {
      attempts++;
      void lookup(productId, key).then(result => {
        if (canceled || !result?.ok) return;
        setAutomatic({ key, result });
        if (result.status === "pending" && attempts < 3 && result.retryAt) {
          const delay = Math.max(1000, Date.parse(result.retryAt) - Date.now() + 100);
          if (delay < 180_000) timer = setTimeout(start, delay);
        }
      });
    };
    const element = frame.current;
    if (!element || !window.IntersectionObserver) { start(); return () => { canceled = true; clearTimeout(timer); }; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); } }, { rootMargin: "120px" });
    observer.observe(element);
    return () => { canceled = true; observer.disconnect(); clearTimeout(timer); };
  }, [productId, key, source.src]);
  const [failedSources, setFailedSources] = React.useState<string[]>([]);
  const fallback = productImageSource({ name, category, catalogImage });
  const result = automatic?.key === key && automatic.result.ok ? automatic.result : null;
  const automaticUrl = result?.status === "ready" && result.imageUrl === `/inventory/${productId}/photo/automatic/image` ? result.imageUrl : null;
  const image = source.src && !failedSources.includes(source.src) ? source : fallback.src ? fallback : automaticUrl ? { ...fallback, src: automaticUrl, alt: `${name}, internet reference photo`, illustrative: false } : fallback;
  const credit = image.src === automaticUrl ? result?.attribution : null;
  React.useEffect(() => { onAutomaticReady?.(Boolean(credit)); }, [onAutomaticReady, credit]);
  const Icon = image.kind === "service" ? Wrench : ["part", "display", "port"].includes(image.kind) ? Settings2 : Package;

  return (
    <div ref={frame} className={cn("relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white", className)}>
      {image.src && !failedSources.includes(image.src) ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          className={cn("object-contain p-2", credit ? showFallbackLabel ? "pb-14" : "pb-8" : "")}
          // Optimisation requests cannot forward the user's cookie to /files.
          unoptimized={image.src.startsWith("/files/") || image.src === automaticUrl}
          onError={() => { if (image.src) setFailedSources((previous) => previous.includes(image.src!) ? previous : [...previous, image.src!]); }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-3 text-muted-foreground" role="img" aria-label={`No photo for ${name}`}>
          <Icon className="size-8" strokeWidth={1.4} aria-hidden />
          {showFallbackLabel ? <span className="text-center text-xs">{image.kind === "service" ? "Service" : "No product photo"}</span> : null}
        </div>
      )}
      {showFallbackLabel && image.illustrative && image.src && !failedSources.includes(image.src) ? <span className="absolute bottom-2 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Category image</span> : null}
      {credit && image.src && !failedSources.includes(image.src) ? <span className="absolute inset-x-1 bottom-1 bg-white px-1 text-center text-[10px] leading-tight text-muted-foreground" title={`${credit.title} · ${credit.author} · ${credit.license} · ${credit.sourceUrl}${credit.changes ? ` · ${credit.changes}` : ""}`}>
        {showFallbackLabel ? <span className="mb-0.5 block font-medium">Internet reference</span> : null}
        {showAttributionLinks ? <><a href={credit.sourceUrl} target="_blank" rel="noreferrer" className="underline">{credit.author}</a> · <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="underline">{credit.license}</a>{credit.changes ? <span className="mt-0.5 block">Resized / WebP</span> : null}</> : <span className="line-clamp-2">{credit.author} · {credit.license}{credit.changes ? " · resized" : ""}</span>}
      </span> : null}
    </div>
  );
}
