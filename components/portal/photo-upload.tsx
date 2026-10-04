"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BIG_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  MAX_UPLOAD_BYTES,
  rejectionReason,
  UPLOAD_ACCEPT,
} from "@/components/tickets/attachment-meta";

/**
 * "Add a photo" on the customer's repair page.
 *
 * Posts to /portal/tickets/<id>/upload for the same reason the staff card does
 * (Server Actions cap a body at 1MB), and re-uses the SAME client-side checks
 * from attachment-meta, so a photo the shop's own card would accept is the one
 * this accepts, and the friendly refusal reads identically on both sides.
 */
export function PhotoUpload({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload(candidates: File[]) {
    if (candidates.length === 0) return;

    // Refused here first so a 40MB video costs nothing to reject; the server
    // re-runs every one of these checks.
    const accepted: File[] = [];
    for (const file of candidates) {
      const reason = rejectionReason(file);
      if (reason) toast.error(reason);
      else accepted.push(file);
    }
    if (accepted.length === 0) return;

    const body = new FormData();
    for (const file of accepted) body.append("files", file);

    setBusy(true);
    try {
      const response = await fetch(`/portal/tickets/${ticketId}/upload`, {
        method: "POST",
        body,
      });
      const result = (await response.json()) as
        | { ok: true; uploaded: number; errors: string[] }
        | { ok: false; error: string };

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      result.errors.forEach((message) => toast.error(message));
      if (result.uploaded > 0) {
        toast.success(result.uploaded === 1 ? "Photo sent" : `${result.uploaded} photos sent`);
        router.refresh();
      }
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(event) => void upload(Array.from(event.target.files ?? []))}
      />
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={BIG_BUTTON}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
        {busy ? "Sending…" : "Add a photo"}
      </Button>
      <span className="text-[14px] text-muted-foreground">
        Photos, PDFs or logs, up to {formatBytes(MAX_UPLOAD_BYTES)} each.
      </span>
    </div>
  );
}
