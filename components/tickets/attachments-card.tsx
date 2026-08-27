"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileArchive,
  FileText,
  File as FileIcon,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { deleteAttachmentAction } from "@/app/(app)/tickets/attachment-actions";
import {
  fileKind,
  formatBytes,
  rejectionReason,
  UPLOAD_ACCEPT,
  type FileKind,
} from "./attachment-meta";
import { PhotoCaptureDialog } from "./photo-capture-dialog";

export type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Public `/uploads/<shopId>/<random>.<ext>` path. */
  path: string;
  createdAtLabel: string;
  uploaderName: string | null;
  uploadedById: string | null;
};

const KIND_ICON: Record<FileKind, React.ComponentType<{ className?: string }>> = {
  image: FileIcon,
  pdf: FileText,
  text: FileText,
  archive: FileArchive,
  other: FileIcon,
};

/**
 * Files on a ticket: intake photos, the customer's screenshot of the error, the
 * log a tech pulled off the machine.
 *
 * Uploads POST to /tickets/<id>/upload rather than going through a Server
 * Action — see the note in that route about the 1MB action body cap. The card
 * then calls `router.refresh()`, so the list it renders always comes from the
 * server rather than from optimistic local state that could disagree with what
 * actually landed on disk.
 */
export function AttachmentsCard({
  ticketId,
  attachments,
  currentUserId,
  isOwner,
}: {
  ticketId: string;
  attachments: AttachmentRow[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

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

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4 text-muted-foreground" />
          Attachments
        </CardTitle>
        {attachments.length > 0 ? (
          <Chip>{attachments.length}</Chip>
        ) : null}
      </CardHeader>

      <CardContent
        // The whole card body is the drop target, so a dragged photo doesn't
        // have to be aimed at a small dashed rectangle.
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          // Dragging over a child fires dragleave on the parent; only a pointer
          // that has actually left the card should clear the highlight.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
        className="flex flex-col gap-4"
      >
        {attachments.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3">
            {attachments.map((attachment) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                canDelete={
                  isOwner || attachment.uploadedById === currentUserId
                }
              />
            ))}
          </ul>
        ) : null}

        <div
          className={cn(
            "flex flex-col items-center gap-2.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
            dragging
              ? "border-accent bg-accent-soft"
              : "border-border-strong bg-surface-hover/50",
          )}
        >
          <Upload
            className={cn(
              "size-5",
              dragging ? "text-accent" : "text-faint-foreground",
            )}
          />
          <p className="text-[13.5px] font-semibold text-foreground">
            {dragging ? "Drop to attach" : "Drop files here"}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Add files"}
            </Button>
            <PhotoCaptureDialog
              disabled={uploading}
              onCapture={(file) => void upload([file])}
            />
          </div>

          <p className="text-[11.5px] leading-snug text-faint-foreground">
            Images, PDFs, text or log files and zips · up to 10 MB each
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              void upload(Array.from(event.target.files ?? []));
              // Reset so picking the same file twice in a row still fires.
              event.target.value = "";
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AttachmentTile({
  attachment,
  canDelete,
}: {
  attachment: AttachmentRow;
  canDelete: boolean;
}) {
  const kind = fileKind(attachment.mimeType);
  const Icon = KIND_ICON[kind];

  return (
    <li className="group relative flex flex-col gap-1.5">
      <a
        href={attachment.path}
        target="_blank"
        rel="noreferrer"
        title={attachment.fileName}
        className="block overflow-hidden rounded-md border border-border bg-surface-hover transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {kind === "image" ? (
          // A plain <img>: these are user uploads on the local filesystem, not
          // build-time assets, so next/image's optimiser has nothing to add.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.path}
            alt={attachment.fileName}
            loading="lazy"
            className="h-24 w-full object-cover"
          />
        ) : (
          <div className="flex h-24 w-full items-center justify-center">
            <Icon className="size-7 text-faint-foreground" />
          </div>
        )}
      </a>

      <div className="min-w-0">
        <p
          className="truncate text-[12.5px] font-semibold text-foreground"
          title={attachment.fileName}
        >
          {attachment.fileName}
        </p>
        <p className="truncate text-[11.5px] text-faint-foreground">
          {formatBytes(attachment.sizeBytes)} · {attachment.createdAtLabel}
          {attachment.uploaderName ? ` · ${attachment.uploaderName}` : ""}
        </p>
      </div>

      {canDelete ? <DeleteAttachmentButton attachment={attachment} /> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------

/**
 * Behind a confirm: an intake photo is the shop's evidence about the state a
 * device arrived in, and there is no undo once the file is off the disk.
 */
function DeleteAttachmentButton({ attachment }: { attachment: AttachmentRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteAttachmentAction(attachment.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("File deleted");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Delete ${attachment.fileName}`}
          className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 p-1.5 text-faint-foreground opacity-0 shadow-sm backdrop-blur transition-[opacity,color] hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this file?</DialogTitle>
          <DialogDescription>
            {attachment.fileName} will be removed from the ticket and deleted
            from disk. This can&rsquo;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={remove}
          >
            {pending ? "Deleting…" : "Delete file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
