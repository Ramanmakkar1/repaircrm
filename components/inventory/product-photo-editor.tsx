"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/inventory/product-image";
import { PRODUCT_PHOTO_ACCEPT, validateProductPhoto } from "@/lib/inventory/product-images";
import type { ProductPhotoResponse } from "@/app/(app)/inventory/[id]/photo/route";

type ProductPhotoProps = { name: string; category?: string | null };

export function ProductPhotoEditor({ productId, name, category, imageUrl }: ProductPhotoProps & { productId: string; imageUrl: string | null }) {
  const input = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [photo, setPhoto] = React.useState(imageUrl);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [hasAutomatic, setHasAutomatic] = React.useState(false);
  const [photoRevision, setPhotoRevision] = React.useState(0);

  async function dismissAutomatic() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/inventory/${productId}/photo/automatic`, { method: "DELETE" });
      if (!response.ok) { setError("Could not remove that internet photo. Try again."); return; }
      setPhotoRevision(previous => previous + 1);
      setHasAutomatic(false);
      setMessage("Internet photo removed. You can upload your own photo.");
      router.refresh();
    } catch { setError("Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function update(file?: File) {
    setError("");
    setMessage("");
    if (file) {
      const reason = await validateProductPhoto(file);
      if (reason) { setError(reason); return; }
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.set("photo", file);
      const response = await fetch(`/inventory/${productId}/photo`, { method: file ? "POST" : "DELETE", body: file ? form : undefined });
      const result: ProductPhotoResponse = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.ok ? "Could not save the photo. Try again." : result.error);
        return;
      }
      setPhoto(result.imageUrl);
      setMessage(file ? "Product photo saved." : "Product photo removed.");
      router.refresh();
    } catch { setError("Photo could not be saved. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ProductImage productId={productId} name={name} category={category} imageUrl={photo} photoRevision={photoRevision} onAutomaticReady={setHasAutomatic} className="w-full shrink-0 border sm:w-40" sizes="160px" showFallbackLabel showAttributionLinks />
      <div className="flex flex-col gap-3">
        <p className="max-w-md text-sm text-muted-foreground">Add a photo of this exact product. It appears in your catalog, checkout, and inventory. Photo changes are saved immediately.</p>
        <input ref={input} type="file" accept={PRODUCT_PHOTO_ACCEPT} className="sr-only" aria-label="Choose product photo" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void update(file); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {photo ? "Replace photo" : "Upload photo"}
          </Button>
          {photo ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void update()}><Trash2 className="size-4" aria-hidden />Remove</Button> : null}
          {!photo && hasAutomatic ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void dismissAutomatic()}><Trash2 className="size-4" aria-hidden />Remove internet photo</Button> : null}
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">JPG, PNG, or WebP · up to 5 MB. Without an upload or category image, we look for a licensed internet reference photo. Check that it matches your product.</p>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{message}</p>
      </div>
    </div>
  );
}

/** Selected File is kept in React state, so validation errors cannot reset it. */
export function NewProductPhoto({ name, category, file, onChange, error }: ProductPhotoProps & { file: File | null; onChange: (file: File | null) => void; error?: string }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [validation, setValidation] = React.useState("");
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File) {
    const reason = await validateProductPhoto(file);
    if (reason) { setValidation(reason); return; }
    setValidation("");
    setPreview(URL.createObjectURL(file));
    onChange(file);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-white sm:w-40">
        {preview ? <Image src={preview} alt={name || "Selected product photo"} fill unoptimized className="object-contain p-2" sizes="160px" /> : <ProductImage name={name} category={category} className="h-full w-full" showFallbackLabel />}
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Help staff recognize the exact product at a glance.</p>
        <input ref={input} type="file" accept={PRODUCT_PHOTO_ACCEPT} className="sr-only" aria-label="Choose new product photo" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void choose(selected); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => input.current?.click()}><Camera className="size-4" aria-hidden />{file ? "Replace photo" : "Choose photo"}</Button>
          {file ? <Button type="button" variant="ghost" onClick={() => { setPreview(null); onChange(null); }}>Remove</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">Optional · JPG, PNG, or WebP · up to 5 MB</p>
        {validation || error ? <p className="text-sm text-destructive" role="alert">{validation || error}</p> : null}
      </div>
    </div>
  );
}
