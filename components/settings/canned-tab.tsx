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
import { Card, CardContent } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CannedResponseItem } from "./types";

/**
 * Canned responses — the reusable message bodies staff drop into a ticket
 * update instead of retyping "your part has arrived" for the ninth time today.
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
      undo: async () => {
        const restored = await saveCannedResponseAction({
          title: item.title,
          body: item.body,
        });
        if (!restored.ok) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not put that response back.",
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <AddIcon aria-hidden /> New response
          </Button>
        </div>
      ) : null}

      {responses.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.message}
            title="No canned responses yet"
            hint={
              canManage
                ? "Save the updates you send most often — parts arrived, ready for pickup, quote approved."
                : "Ask an owner or the front desk to add the messages your shop sends most often."
            }
            action={
              canManage ? (
                <Button onClick={() => setCreating(true)}>
                  <AddIcon aria-hidden /> New response
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {responses.map((item) => (
            <Card key={item.id} className="rf-lift flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 py-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold tracking-tight text-foreground">
                    {item.title}
                  </h3>
                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Icon-only because they repeat on every card — so both
                          carry an aria-label and a tooltip. */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => setEditing(item)}
                          >
                            <EditIcon aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit response</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label={`Delete ${item.title}`}
                            className="text-faint-foreground hover:bg-destructive-soft hover:text-destructive"
                            onClick={() => remove(item)}
                          >
                            {busy ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <DeleteIcon aria-hidden />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete response</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CannedDialog
        // Keyed on what is being edited: each open remounts the form with the
        // right seed values, so no effect is needed to sync props into state.
        key={editing?.id ?? (creating ? "new" : "idle")}
        open={creating || editing !== null}
        item={editing}
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
}: {
  open: boolean;
  item: CannedResponseItem | null;
  onClose: () => void;
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
    toast.success(item ? "Response updated." : "Response added.");
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
          <DialogTitle>{item ? "Edit response" : "New canned response"}</DialogTitle>
          <DialogDescription>
            Staff pick these by title when posting a ticket update.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="canned-title">Title</Label>
            <Input
              id="canned-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Parts arrived"
              maxLength={120}
              autoFocus
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

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : item ? (
                <SaveIcon aria-hidden />
              ) : (
                <AddIcon aria-hidden />
              )}
              {busy ? "Saving…" : item ? "Save changes" : "Add response"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
