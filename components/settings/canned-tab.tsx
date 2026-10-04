"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toastWithUndo } from "@/components/ui/undo-toast";

import {
  deleteCannedResponseAction,
  saveCannedResponseAction,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CannedResponseItem } from "./types";

/**
 * Saved replies (stored as "canned responses") — the reusable messages staff
 * drop into a repair update instead of retyping "your part has arrived" for
 * the ninth time today. Each one is shown as the message bubble the customer
 * will read, with one Edit button; Delete lives inside the edit sheet, with
 * an Undo.
 *
 * Everyone can read them (a tech needs to see what the shop's voice sounds
 * like); only OWNER and FRONT_DESK can change them, which `canManage` mirrors
 * from the server-side check in the actions.
 */
const AddIcon = ACTIONS.add;
const EditIcon = ACTIONS.edit;
const DeleteIcon = ACTIONS.delete;
const SaveIcon = ACTIONS.save;

export function CannedTab({
  responses,
  canManage,
}: {
  responses: CannedResponseItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<CannedResponseItem | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  /**
   * Delete, then offer it back — no confirm dialog.
   *
   * A confirm taxes every deletion to protect the rare mistake, and after the
   * twentieth one nobody reads it, so it stops protecting anything while still
   * costing everybody two clicks. Undo inverts that.
   *
   * The undo is real, not decorative: the row is hard-deleted, but this client
   * still holds the title and body, so restoring is a genuine re-create
   * through the same validated action the editor uses. The restored response
   * gets a new id — which is harmless here, because nothing references a
   * canned response by id; its text is copied into a message at send time.
   */
  async function remove(item: CannedResponseItem) {
    setBusy(true);
    const result = await deleteCannedResponseAction(item.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    router.refresh();

    toastWithUndo({
      message: `"${item.title}" deleted.`,
      description: "Changed your mind? Undo puts it back.",
      undo: async () => {
        const restored = await saveCannedResponseAction({
          title: item.title,
          body: item.body,
        });
        if (!restored.ok) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not put that reply back.",
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <div className="flex">
          <Button onClick={() => setCreating(true)} className="h-12 px-5 text-base">
            <AddIcon aria-hidden /> New saved reply
          </Button>
        </div>
      ) : null}

      {responses.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.message}
            title="No saved replies yet"
            hint={
              canManage
                ? "Save the messages you send most often: parts arrived, ready for pickup, quote approved."
                : "Ask an owner or the front desk to add the messages your shop sends most often."
            }
            action={
              canManage ? (
                <Button onClick={() => setCreating(true)} className="h-12">
                  <AddIcon aria-hidden /> New saved reply
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul aria-label="Saved replies" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {responses.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 text-[17px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
                  {item.title}
                </h3>
                {canManage ? (
                  <Button
                    variant="outline"
                    className="h-12 shrink-0 px-4"
                    aria-label={`Edit ${item.title}`}
                    disabled={busy}
                    onClick={() => setEditing(item)}
                  >
                    <EditIcon aria-hidden /> Edit
                  </Button>
                ) : null}
              </div>
              {/* The message as the customer reads it. */}
              <p className="line-clamp-5 whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface-hover px-4 py-3 text-[15px] leading-relaxed text-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <CannedDialog
        // Keyed on what is being edited: each open remounts the form with the
        // right seed values, so no effect is needed to sync props into state.
        key={editing?.id ?? (creating ? "new" : "idle")}
        open={creating || editing !== null}
        item={editing}
        onDelete={
          editing && canManage
            ? () => {
                const item = editing;
                setEditing(null);
                void remove(item);
              }
            : undefined
        }
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

    </div>
  );
}

function CannedDialog({
  open,
  item,
  onClose,
  onDelete,
}: {
  open: boolean;
  item: CannedResponseItem | null;
  onClose: () => void;
  /** Editing an existing reply: take it off the list (with Undo on the toast). */
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  // The parent keys this component on `item`, so each open mounts fresh with
  // the right seed values.
  const [title, setTitle] = React.useState(item?.title ?? "");
  const [body, setBody] = React.useState(item?.body ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveCannedResponseAction({ id: item?.id ?? null, title, body });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(item ? "Saved." : "Saved. The new reply is ready to use.");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit saved reply" : "New saved reply"}</DialogTitle>
          <DialogDescription>
            Staff pick these by name when they send a customer an update.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="canned-title">Name</Label>
            <Input
              id="canned-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Parts arrived"
              maxLength={120}
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="canned-body">Message</Label>
            <Textarea
              id="canned-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              placeholder="Good news — the part for your repair has arrived and we've started work."
              maxLength={5000}
            />
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 text-destructive hover:bg-destructive-soft hover:text-destructive"
                disabled={busy}
                onClick={onDelete}
              >
                <DeleteIcon aria-hidden /> Delete this reply
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" className="h-12" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="h-12 px-5" disabled={busy}>
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : item ? (
                  <SaveIcon aria-hidden />
                ) : (
                  <AddIcon aria-hidden />
                )}
                {busy ? "Saving…" : item ? "Save" : "Add reply"}
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
