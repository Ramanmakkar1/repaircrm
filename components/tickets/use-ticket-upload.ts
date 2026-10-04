"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { rejectionReason } from "./attachment-meta";

/**
 * Sends files to a repair: the one upload path the Photos & files section and
 * the Add photo tile share.
 *
 * Uploads POST to /tickets/<id>/upload rather than going through a Server
 * Action, because actions cap their body at 1MB and this promises 10MB a file.
 * After a successful upload the page is refreshed, so what is listed always
 * comes from the server and not from a guess about what landed on disk.
 */
export function useTicketUpload(ticketId: string) {
  const router = useRouter();
  const [uploading, setUploading] = React.useState(false);

  const upload = React.useCallback(
    async (candidates: File[]) => {
      if (candidates.length === 0) return;

      // Reject client-side first so a 40MB file costs nothing to refuse. The
      // server re-checks every one of these — this is courtesy, not security.
      const accepted: File[] = [];
      for (const file of candidates) {
        const reason = rejectionReason(file);
        if (reason) toast.error(reason);
        else accepted.push(file);
      }
      if (accepted.length === 0) return;

      const body = new FormData();
      for (const file of accepted) body.append("files", file);

      setUploading(true);
      try {
        const response = await fetch(`/tickets/${ticketId}/upload`, {
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

        // Partial success is a real outcome, so both halves get reported.
        result.errors.forEach((message) => toast.error(message));
        if (result.uploaded > 0) {
          toast.success(
            result.uploaded === 1
              ? "File attached"
              : `${result.uploaded} files attached`,
          );
          router.refresh();
        }
      } catch {
        toast.error("The upload didn't go through — check your connection.");
      } finally {
        setUploading(false);
      }
    },
    [ticketId, router],
  );

  return { upload, uploading };
}
