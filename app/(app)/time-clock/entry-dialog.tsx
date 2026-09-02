"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteTimeClockEntryAction,
  updateTimeClockEntryAction,
} from "./actions";

/**
 * The owner's correction dialog — "Ivan forgot to clock out on Friday".
 *
 * Times are `datetime-local`, which posts a bare local string; the action
 * parses it against the shop's own clock rather than letting the browser guess
 * a zone. Clearing the end time is a legitimate edit (it puts a shift back to
 * running), so it is an allowed empty rather than a validation error.
 */
export function EntryDialog({
  entryId,
  userName,
  clockInValue,
  clockOutValue,
  note,
}: {
  entryId: string;
  userName: string;
  /** Pre-formatted `yyyy-MM-ddTHH:mm` so the input never re-parses a timestamp. */
  clockInValue: string;
  clockOutValue: string;
  note: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState({
    clockIn: clockInValue,
    clockOut: clockOutValue,
    note,
  });

  /** Re-opening after a refresh starts from what the server now holds. */
  function openEditor() {
    setValues({ clockIn: clockInValue, clockOut: clockOutValue, note });
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    const result = await updateTimeClockEntryAction(entryId, values);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Timesheet updated.");
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteTimeClockEntryAction(entryId);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Entry deleted.");
    setConfirming(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* Icon-only because this pair repeats on every shift row; each one
          carries its own label and a tooltip so the glyph is never the only
          thing telling you what it does. */}
      <div className="flex items-center justify-end gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={openEditor}
              aria-label={`Edit ${userName}'s entry`}
            >
              <ACTIONS.edit className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit this shift</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${userName}'s entry`}
            >
              <ACTIONS.delete className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete this shift</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {userName}&rsquo;s shift</DialogTitle>
            <DialogDescription>
              Corrections belong here rather than in a spreadsheet — this is the
              record payroll reads.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clock-in">Clocked in</Label>
              <Input
                id="clock-in"
                type="datetime-local"
                value={values.clockIn}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, clockIn: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clock-out">Clocked out</Label>
              <Input
                id="clock-out"
                type="datetime-local"
                value={values.clockOut}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, clockOut: event.target.value }))
                }
              />
              <p className="text-[12.5px] text-muted-foreground">
                Leave this empty to put the shift back to running.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clock-note">Note</Label>
              <Input
                id="clock-note"
                value={values.note}
                maxLength={200}
                placeholder="Forgot to clock out"
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.save />}
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              It disappears from {userName}&rsquo;s week and from the payroll
              export. Editing the times is usually the better fix.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.delete />}
              {busy ? "Deleting…" : "Delete entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
