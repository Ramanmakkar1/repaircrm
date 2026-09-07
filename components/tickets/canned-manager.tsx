"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
// Settings2 is "manage the list", which is not one of the shared verbs.
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toastWithUndo } from "@/components/ui/undo-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCannedResponseAction,
  deleteCannedResponseAction,
} from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";

export type Canned = { id: string; title: string; body: string };

/**
 * Inline management for the shop's canned replies, so a tech can add the phrase
 * they just typed for the third time without leaving the ticket. A fuller
 * editor belongs in Settings later; this covers the moment it's actually needed.
 *
 * Radix portals the dialog to <body>, so the form inside is never nested in the
 * composer's form — which would be invalid HTML and silently break submission.
 */
export function CannedManager({ responses }: { responses: Canned[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  /**
   * Delete, then offer it back.
   *
   * This is the same record the settings screen already treats this way — see
   * components/settings/canned-tab.tsx — and it was the one place in the app
   * where the identical row was deleted silently, with nothing offered and no
   * way back. The undo is real for the same reason it is there: the row is
   * hard-deleted, but this client still holds the title and the body, and
   * nothing references a canned response by id (its text is copied into the
   * message at send time), so re-creating it through the same validated action
   * restores everything anybody can see.
   */
  async function remove(response: Canned) {
    setRemoving(response.id);
    await deleteCannedResponseAction(response.id);
    setRemoving(null);
    router.refresh();

    toastWithUndo({
      message: `"${response.title}" deleted.`,
      undo: async () => {
        const form = new FormData();
        form.set("title", response.title);
        form.set("body", response.body);

        const restored = await createCannedResponseAction(EMPTY_STATE, form);
        if (restored.error) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not put that response back.",
    });
  }

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createCannedResponseAction(previous, formData);
      if (result.ok) {
        formRef.current?.reset();
        toast.success("Canned response saved.");
      }
      return result;
    },
    EMPTY_STATE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Settings2 className="size-4" />
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Canned responses</DialogTitle>
          <DialogDescription>
            Reusable messages available to everyone in the shop.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {responses.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No canned responses yet.
            </p>
          ) : (
            responses.map((response) => (
              <div
                key={response.id}
                className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {response.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {response.body}
                  </p>
                </div>
                {/* The spinner REPLACES the bin rather than crowding in
                    beside it in a 36px icon button. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={removing !== null}
                  aria-label={`Delete ${response.title}`}
                  className="text-faint-foreground hover:text-destructive"
                  onClick={() => remove(response)}
                >
                  {removing === response.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ACTIONS.delete className="size-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        <Separator />

        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="canned-title">Title</Label>
            <Input
              id="canned-title"
              name="title"
              required
              maxLength={80}
              placeholder="Ready for pickup"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="canned-body">Message</Label>
            <Textarea
              id="canned-body"
              name="body"
              required
              rows={3}
              placeholder="Good news — your device is repaired and ready for pickup…"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              <ACTIONS.add />
              {pending ? "Saving…" : "Add response"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
