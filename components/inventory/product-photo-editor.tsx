"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/inventory/product-image";
import { resolvePicture } from "@/components/inventory/picture-picker-logic";
import { PRODUCT_PHOTO_ACCEPT, validateProductPhoto } from "@/lib/inventory/product-images";
import type { ProductPhotoResponse } from "@/app/(app)/inventory/[id]/photo/route";

type ProductPhotoProps = {
  name: string;
  category?: string | null;
  /** Key of the picture chosen on purpose (see the picture picker), or null for "pick it from the name". */
  catalogImage?: string | null;
};

/**
 * What the photo box says under the preview. Same words as the picture picker, so the two never disagree:
 * an uploaded photo always wins, and the picture is what is used without one.
 */
function PhotoStatus({ name, category, catalogImage, photoUrl }: ProductPhotoProps & { photoUrl: string | null }) {
  const choice = resolvePicture({ name, category, value: catalogImage, uploadedPhotoUrl: photoUrl });
  return (
    <div className="flex flex-col gap-0.5" role="status" aria-live="polite">
      <p className="text-sm font-medium">{choice.short}</p>
      {choice.fallbackSentence ? <p className="text-[13px] text-muted-foreground">{choice.fallbackSentence}</p> : null}
    </div>
  );
}

export function ProductPhotoEditor({
  productId,
  name,
  category,
  catalogImage,
  imageUrl,
  onPhotoChange,
  pictureHref,
  showStatus = true,
}: ProductPhotoProps & {
  productId: string;
  imageUrl: string | null;
  /** Off where a picture picker already says the same thing beside it. */
  showStatus?: boolean;
  /** Told whenever the saved photo changes (a new URL, or null once removed), so a picture picker beside it can follow. */
  onPhotoChange?: (url: string | null) => void;
  /** Where the picture can be changed (the edit page), when this box is not on that page already. */
  pictureHref?: string;
}) {
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
      onPhotoChange?.(result.imageUrl);
      setMessage(file ? "Product photo saved." : "Product photo removed.");
      router.refresh();
    } catch { setError("Photo could not be saved. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ProductImage productId={productId} name={name} category={category} catalogImage={catalogImage} imageUrl={photo} photoRevision={photoRevision} onAutomaticReady={setHasAutomatic} className="size-36 shrink-0 border sm:size-40" sizes="160px" showFallbackLabel showAttributionLinks />
      <div className="flex flex-col gap-3">
        {showStatus ? <PhotoStatus name={name} category={category} catalogImage={catalogImage} photoUrl={photo} /> : null}
        <p className="max-w-md text-sm text-muted-foreground">Add a photo of this exact product. Your own photo is always used instead of the picture, in checkout, stock and everywhere else. Photo changes are saved immediately.</p>
        <input ref={input} type="file" accept={PRODUCT_PHOTO_ACCEPT} className="sr-only" aria-label="Choose product photo" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void update(file); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {photo ? "Replace photo" : "Upload photo"}
          </Button>
          {photo ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void update()}><Trash2 className="size-4" aria-hidden />Remove</Button> : null}
          {!photo && hasAutomatic ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void dismissAutomatic()}><Trash2 className="size-4" aria-hidden />Remove internet photo</Button> : null}
          {pictureHref ? <Button variant="ghost" asChild><Link href={pictureHref}>Change picture</Link></Button> : null}
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">JPG, PNG, or WebP · up to 5 MB. With no photo and no matching picture, we look for a licensed internet reference photo. Check that it matches your product.</p>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{message}</p>
      </div>
    </div>
  );
}

/** Selected File is kept in React state, so validation errors cannot reset it. */
export function NewProductPhoto({ name, category, catalogImage, file, onChange, onPreview, error, showStatus = true }: ProductPhotoProps & {
  file: File | null;
  /** Off where a picture picker already says the same thing beside it. */
  showStatus?: boolean;
  onChange: (file: File | null) => void;
  /** Told whenever the browser preview of the chosen photo appears or goes, so a picture picker beside it can follow. */
  onPreview?: (url: string | null) => void;
  error?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [validation, setValidation] = React.useState("");
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File) {
    const reason = await validateProductPhoto(file);
    if (reason) { setValidation(reason); return; }
    setValidation("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    onPreview?.(url);
    onChange(file);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative aspect-square size-36 shrink-0 overflow-hidden rounded-lg border bg-white sm:size-40">
        {preview ? <Image src={preview} alt={name || "Selected product photo"} fill unoptimized className="object-contain p-2" sizes="160px" /> : <ProductImage name={name} category={category} catalogImage={catalogImage} className="h-full w-full" showFallbackLabel />}
      </div>
      <div className="flex flex-col gap-3">
        {showStatus ? <PhotoStatus name={name} category={category} catalogImage={catalogImage} photoUrl={preview} /> : null}
        <p className="max-w-md text-sm text-muted-foreground">Optional. Your own photo is always used instead of the picture, so staff recognise the exact product at a glance.</p>
        <input ref={input} type="file" accept={PRODUCT_PHOTO_ACCEPT} className="sr-only" aria-label="Choose new product photo" onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void choose(selected); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => input.current?.click()}><Camera className="size-4" aria-hidden />{file ? "Replace photo" : "Choose photo"}</Button>
          {file ? <Button type="button" variant="ghost" onClick={() => { setPreview(null); onPreview?.(null); onChange(null); }}>Remove</Button> : null}
        </div>
        <p className="text-xs text-muted-foreground">Optional · JPG, PNG, or WebP · up to 5 MB</p>
        {validation || error ? <p className="text-sm text-destructive" role="alert">{validation || error}</p> : null}
      </div>
    </div>
  );
}
