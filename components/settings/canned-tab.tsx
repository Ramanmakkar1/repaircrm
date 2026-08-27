"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CannedResponseItem } from "./types";

/**
 * Canned responses — the reusable message bodies staff drop into a ticket
 * update instead of retyping "your part has arrived" for the ninth time today.
 *
 * Everyone can read them (a tech needs to see what the shop's voice sounds
 * like); only OWNER and FRONT_DESK can change them, which `canManage` mirrors
 * from the server-side check in the actions.
 */
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
  const [removing, setRemoving] = React.useState<CannedResponseItem | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function remove(item: CannedResponseItem) {
    setBusy(true);
    const result = await deleteCannedResponseAction(item.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${item.title}" deleted.`);
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New response
          </Button>
        </div>
      ) : null}

      {responses.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareText}
            title="No canned responses yet"
            hint={
              canManage
                ? "Save the updates you send most often — parts arrived, ready for pickup, quote approved."
                : "Ask an owner or the front desk to add the messages your shop sends most often."
            }
            action={
              canManage ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> New response
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
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${item.title}`}
                        onClick={() => setEditing(item)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${item.title}`}
                        className="text-faint-foreground hover:bg-destructive-soft hover:text-destructive"
                        onClick={() => setRemoving(item)}
                      >
                        <Trash2 />
                      </Button>
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

      <Dialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{removing?.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              Messages already sent keep their text — this only removes the
              shortcut. It can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && remove(removing)}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              {busy ? "Saving…" : item ? "Save changes" : "Add response"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
