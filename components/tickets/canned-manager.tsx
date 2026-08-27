"use client";

import * as React from "react";
import { useActionState } from "react";
import { Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createCannedResponseAction(previous, formData);
      if (result.ok) {
        formRef.current?.reset();
        toast.success("Canned response saved");
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
                <form action={deleteCannedResponseAction.bind(null, response.id)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${response.title}`}
                    className="text-faint-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
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
              {pending ? "Saving…" : "Add response"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
