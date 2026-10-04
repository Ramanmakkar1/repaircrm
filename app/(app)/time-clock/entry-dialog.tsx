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
  easy = false,
  suggestedOut,
  suggestedLabel,
}: {
  entryId: string;
  userName: string;
  /** Pre-formatted `yyyy-MM-ddTHH:mm` (the shop's wall clock) so the input never re-parses a timestamp. */
  clockInValue: string;
  clockOutValue: string;
  note: string;
  /**
   * Easy mode: ONE worded button, "Fix this shift", with Delete inside the
   * dialog. Full mode keeps a compact pair, also in words: "Edit" and "Delete".
   */
  easy?: boolean;
  /** A forgotten shift: the clock-out the dialog suggests (`yyyy-MM-ddTHH:mm`), still to be saved by a person. */
  suggestedOut?: string;
  /** The suggestion in words: "6:00 PM". */
  suggestedLabel?: string;
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

  /** Re-opening after a refresh starts from what the server now holds (plus the suggested clock-out of a forgotten shift). */
  function openEditor() {
    setValues({ clockIn: clockInValue, clockOut: clockOutValue || suggestedOut || "", note });
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
      {easy ? (
        // One worded button per shift; deleting is a choice inside the dialog, never a red bin beside the pencil.
        <Button
          variant={suggestedOut ? "default" : "outline"}
          className="h-12 shrink-0 px-4 text-base"
          onClick={openEditor}
          aria-label={`Fix ${userName}'s shift`}
        >
          <ACTIONS.edit className="size-4" />
          Fix this shift
        </Button>
      ) : (
        // Words, not a pencil and a bin: the pair repeats on every row, and a glyph alone says too little.
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={openEditor} aria-label={`Edit ${userName}'s entry`}>
            <ACTIONS.edit className="size-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${userName}'s entry`}
          >
            Delete
          </Button>
        </div>
      )}

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
                {suggestedOut && !clockOutValue
                  ? `Still running, so ${suggestedLabel ?? "a time"} is filled in for you. Change it if you know when they left.`
                  : "Leave this empty to put the shift back to running."}
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

          <DialogFooter className={easy ? "gap-2 sm:justify-between" : undefined}>
            {easy ? (
              <Button
                variant="ghost"
                className="h-12 text-base text-destructive hover:bg-destructive-soft hover:text-destructive"
                onClick={() => setConfirming(true)}
                disabled={busy}
              >
                <ACTIONS.delete />
                Delete this shift
              </Button>
            ) : null}
            <div className="flex gap-2 sm:justify-end">
              <Button variant="ghost" className={easy ? "h-12 text-base" : undefined} onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button className={easy ? "h-12 flex-1 px-6 text-base sm:flex-none" : undefined} onClick={save} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <ACTIONS.save />}
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
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
