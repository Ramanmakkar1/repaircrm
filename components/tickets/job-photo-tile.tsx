"use client";

import * as React from "react";
import { Camera } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { PhotoCaptureDialog } from "./photo-capture-dialog";
import { TILE_CLASS, TileFace } from "./job-tile";
import { useTicketUpload } from "./use-ticket-upload";

/**
 * "Add photo": one tap to the camera, and the picture lands on the repair.
 *
 * It is the same camera dialog the Photos & files section has ("Take photo"),
 * sending through the same upload. Where the browser has no camera to open (a
 * desk PC, a page that is not on HTTPS) the tile opens the file picker for
 * images instead, which on a phone offers the camera too.
 */
export function JobPhotoTile({ ticketId }: { ticketId: string }) {
  const { upload, uploading } = useTicketUpload(ticketId);
  const picker = React.useRef<HTMLInputElement>(null);

  const label = uploading ? "Uploading…" : "Add photo";

  return (
    <PhotoCaptureDialog
      disabled={uploading}
      onCapture={(file) => void upload([file])}
      trigger={
        <button type="button" className={cn(TILE_CLASS, "disabled:opacity-50")} disabled={uploading}>
          <TileFace icon={Camera} label={label} />
        </button>
      }
      fallback={
        <>
          <button
            type="button"
            className={cn(TILE_CLASS, "disabled:opacity-50")}
            disabled={uploading}
            onClick={() => picker.current?.click()}
          >
            <TileFace icon={Camera} label={label} />
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void upload(Array.from(event.target.files ?? []));
              // Reset so picking the same photo twice in a row still fires.
              event.target.value = "";
            }}
          />
        </>
      }
    />
  );
}
