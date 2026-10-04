"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileArchive,
  FileText,
  File as FileIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
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
  UPLOAD_ACCEPT,
  type FileKind,
} from "./attachment-meta";
import { PhotoCaptureDialog } from "./photo-capture-dialog";
import { useTicketUpload } from "./use-ticket-upload";

export type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
  easy = false,
}: {
  ticketId: string;
  attachments: AttachmentRow[];
  currentUserId: string;
  isOwner: boolean;
  /** Easy mode: the two ways to add a file come first and are big, and the pictures are bigger. */
  easy?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { upload, uploading } = useTicketUpload(ticketId);
  const [dragging, setDragging] = React.useState(false);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  const fileInput = (
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
  );

  if (easy) {
    // No card: the repair screen's tab is the box. Adding comes first, in two big
    // buttons; what is already attached follows as big pictures.
    return (
      <section
        aria-label="Photos and files"
        className={cn(
          "flex flex-col gap-4 rounded-2xl",
          dragging && "ring-2 ring-accent ring-offset-4 ring-offset-background",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Photos &amp; files</h2>
          {attachments.length > 0 ? <Chip>{attachments.length}</Chip> : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <PhotoCaptureDialog large disabled={uploading} onCapture={(file) => void upload([file])} />
          <Button
            type="button"
            variant="outline"
            className="h-14 flex-1 px-5 text-base [&_svg]:size-5"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ACTIONS.upload />
            {uploading ? "Uploading…" : "Add files"}
          </Button>
        </div>
        <p className="px-1 text-sm text-muted-foreground">
          {dragging ? "Drop to attach." : "Images, PDFs, text or log files and zips, up to 10 MB each."}
        </p>
        {fileInput}

        {attachments.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {attachments.map((attachment) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                canDelete={isOwner || attachment.uploadedById === currentUserId}
                large
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="rounded-2xl border border-dashed border-border-strong py-10"
            icon={ICONS.attachment}
            title="No photos or files yet"
            hint="Take a photo of the device as it arrived: it settles every 'that scratch was already there'."
          />
        )}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={ICONS.attachment}
        title="Attachments"
        action={attachments.length > 0 ? <Chip>{attachments.length}</Chip> : null}
      />

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
              <ACTIONS.upload />
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

          {fileInput}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AttachmentTile({
  attachment,
  canDelete,
  large = false,
}: {
  attachment: AttachmentRow;
  canDelete: boolean;
  /** Easy mode: a taller picture and bigger words. */
  large?: boolean;
}) {
  const kind = fileKind(attachment.mimeType);
  const Icon = KIND_ICON[kind];

  return (
    <li className="group relative flex flex-col gap-1.5">
      <a
        href={`/files/${attachment.id}`}
        target="_blank"
        rel="noreferrer"
        title={attachment.fileName}
        className="block overflow-hidden rounded-md border border-border bg-surface-hover transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {kind === "image" ? (
          // A plain <img>: these are session-gated uploads served by a route
          // handler, not build-time assets, so next/image's optimiser has
          // nothing to add and could not fetch them anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/files/${attachment.id}`}
            alt={attachment.fileName}
            loading="lazy"
            className={cn("w-full object-cover", large ? "h-36" : "h-24")}
          />
        ) : (
          <div className={cn("flex w-full items-center justify-center", large ? "h-36" : "h-24")}>
            <Icon className={cn("text-faint-foreground", large ? "size-10" : "size-7")} />
          </div>
        )}
      </a>

      <div className="min-w-0">
        <p
          className={cn("truncate font-semibold text-foreground", large ? "text-sm" : "text-[12.5px]")}
          title={attachment.fileName}
        >
          {attachment.fileName}
        </p>
        <p className={cn("truncate text-faint-foreground", large ? "text-[13px] text-muted-foreground" : "text-[11.5px]")}>
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
      toast.success("File deleted.");
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
            {attachment.fileName} will be removed from the repair and deleted
            from storage. This can&rsquo;t be undone.
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
            <ACTIONS.delete />
            {pending ? "Deleting…" : "Delete file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
