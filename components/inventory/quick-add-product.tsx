"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTIONS } from "@/components/ui/icons";
import { quickAddProductAction } from "@/app/(app)/inventory/actions";
import { VoiceCapture } from "./voice-capture";
import { PhotoIdentify } from "./photo-identify";
import type { VoiceProductFields } from "@/app/(app)/inventory/voice-actions";

/**
 * Quick Add — the fast path onto the shelf.
 *
 * Four fields (name, price, quantity, category) instead of the full form's
 * fourteen, a SKU minted for you, and a mic that fills the same fields from a
 * spoken sentence. It stays open after a save and clears itself, so a stock
 * delivery can be rattled in one item after another; the full form is one click
 * away for the times a product really needs vendors, warranty or serials.
 *
 * Fields are controlled so voice can populate them and a server-side field error
 * can render without wiping what's there. Submit goes through a transition (not
 * a `<form action>`) so success can toast, reset and refocus rather than
 * navigate away.
 */
export function QuickAddProduct({
  aiEnabled,
  cloudVoice = false,
  className,
  label = "New Product",
}: {
  /** Whether the AI driver is configured — gates the mic (voice needs a model). */
  aiEnabled: boolean;
  /** Whether cloud transcription is set up — enables multilingual spoken input. */
  cloudVoice?: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [category, setCategory] = React.useState("");

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const reset = React.useCallback(() => {
    setName("");
    setPrice("");
    setQuantity("");
    setCategory("");
    setFieldErrors({});
    setFormError(null);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function fillFromVoice(fields: VoiceProductFields) {
    setName(fields.name);
    if (fields.category != null) setCategory(fields.category);
    if (fields.price != null) setPrice(fields.price);
    if (fields.quantity != null) setQuantity(fields.quantity);
    setFieldErrors({});
    setFormError(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("price", price.trim());
    formData.set("stockQty", quantity.trim());
    formData.set("category", category.trim());

    startTransition(async () => {
      const result = await quickAddProductAction(undefined, formData);
      if (result?.ok) {
        toast.success(`Added ${result.name} · ${result.sku}`);
        reset();
        // The list behind the dialog is now stale; refresh it for when they close.
        router.refresh();
        nameRef.current?.focus();
      } else if (result) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? "Couldn't add the product.");
      }
    });
  }

  const canSubmit = name.trim() !== "" && price.trim() !== "" && !pending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className={className}>
          <ACTIONS.add />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add product</DialogTitle>
          <DialogDescription>
            Just a name and price to get it on the shelf — a SKU is assigned for
            you.
          </DialogDescription>
        </DialogHeader>

        {aiEnabled ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-accent/25 bg-accent-soft/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <VoiceCapture onFill={fillFromVoice} cloud={cloudVoice} />
              <PhotoIdentify onFill={fillFromVoice} />
            </div>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Speak a command or snap a photo of the part, then check the fields
              before adding.
            </p>
          </div>
        ) : null}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {formError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive-soft px-3.5 py-2.5 text-[13px] font-medium text-destructive"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="qa-name">
              Name<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="qa-name"
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              placeholder="iPhone 6 Screen"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-[13px] font-medium text-destructive">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="qa-price">
                Price<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-faint-foreground">
                  $
                </span>
                <Input
                  id="qa-price"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7 tabular-nums"
                  aria-invalid={Boolean(fieldErrors.price)}
                />
              </div>
              {fieldErrors.price ? (
                <p className="text-[13px] font-medium text-destructive">
                  {fieldErrors.price}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="qa-quantity">In stock</Label>
              <Input
                id="qa-quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                type="number"
                inputMode="numeric"
                step={1}
                min={0}
                placeholder="0"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="qa-category">Category</Label>
            <Input
              id="qa-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Screens"
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/inventory/new"
              className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Need more fields? Full form →
            </Link>
            <Button type="submit" disabled={!canSubmit} aria-busy={pending}>
              {pending ? "Adding…" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
