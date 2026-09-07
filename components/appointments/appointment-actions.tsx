"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// CalendarPlus is "book something"; it has no entry in the shared concept map.
// the shared verb map.
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import {
  deleteAppointmentAction,
  setAppointmentStatusAction,
} from "@/app/(app)/appointments/actions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastWithUndo } from "@/components/ui/undo-toast";
import {
  AppointmentDialog,
  type AppointmentFormValues,
  type AppointmentPickers,
} from "./appointment-dialog";

/** The header button. Owns its own open state — no navigation involved. */
export function NewAppointmentButton({
  pickers,
  defaults,
}: {
  pickers: AppointmentPickers;
  defaults: AppointmentFormValues;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus />
        New Appointment
      </Button>
      {/* Remounting on open throws away whatever a cancelled draft left behind. */}
      {open ? (
        <AppointmentDialog
          open={open}
          onOpenChange={setOpen}
          values={defaults}
          pickers={pickers}
        />
      ) : null}
    </>
  );
}

/**
 * The dialog the URL asked for: `?at=` (clicked an empty slot) or `?edit=`
 * (clicked a block). Driving these from the query string rather than from React
 * state is what lets the SERVER render the whole grid — a block is a plain
 * link, and a booking is deep-linkable and survives a refresh.
 *
 * Closing navigates back to the clean calendar URL so the dialog doesn't
 * reappear on the next render.
 */
export function AutoAppointmentDialog({
  pickers,
  values,
  closeHref,
}: {
  pickers: AppointmentPickers;
  values: AppointmentFormValues;
  closeHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  const close = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) router.replace(closeHref, { scroll: false });
    },
    [router, closeHref],
  );

  return (
    <AppointmentDialog
      open={open}
      onOpenChange={close}
      values={values}
      pickers={pickers}
      onSaved={() => router.replace(closeHref, { scroll: false })}
    />
  );
}

/**
 * Mark done · Cancel · Reopen · Delete, on a table row.
 *
 * These used to be three always-visible buttons in the last cell, which on a
 * dense row is more chrome than content. They are a `⋯` overflow menu now,
 * revealed on row hover on a pointer device and always visible on touch, where
 * there is no hover to reveal anything with.
 */
export function AppointmentRowActions({
  appointmentId,
  editHref,
  status,
  canDelete,
}: {
  appointmentId: string;
  /** The calendar URL that opens this booking's edit dialog. */
  editHref: string;
  status: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  /**
   * A status move, with the way back attached.
   *
   * All three moves here are the same single-column write, and the reverse is
   * literally the same action with the old value — so each one gets an Undo
   * rather than a "are you sure you want to cancel?" that would ask twice
   * about a booking somebody has already decided about.
   *
   * The important thing this checks is that CANCELLING SENDS NOTHING.
   * `setAppointmentStatusAction` writes one enum column; the confirmation
   * email lives in `saveAppointmentAction`, the create/edit path, and the
   * reminder job only ever looks at SCHEDULED rows with no `reminderSentAt`.
   * So an undone cancellation neither un-sends anything nor re-sends anything,
   * which is exactly what makes this honest.
   */
  async function move(next: string, message: string) {
    const previous = status;

    setBusy(true);
    const result = await setAppointmentStatusAction(appointmentId, next);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();

    toastWithUndo({
      message,
      undo: async () => {
        const restored = await setAppointmentStatusAction(appointmentId, previous);
        if (!restored.ok) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not move that booking back.",
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Appointment actions"
            disabled={busy}
            className="size-7 [&_svg]:size-4 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          >
            <ACTIONS.more />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={editHref} scroll={false}>
              <ACTIONS.edit className="size-4 text-muted-foreground" />
              Edit booking
            </Link>
          </DropdownMenuItem>

          {status === "SCHEDULED" ? (
            <>
              <DropdownMenuItem onSelect={() => move("DONE", "Marked done.")}>
                <ACTIONS.approve className="size-4 text-muted-foreground" />
                Mark done
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => move("CANCELED", "Appointment canceled.")}
              >
                <ACTIONS.decline className="size-4 text-muted-foreground" />
                Cancel booking
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onSelect={() => move("SCHEDULED", "Back on the calendar.")}
            >
              <ACTIONS.reopen className="size-4 text-muted-foreground" />
              Reopen
            </DropdownMenuItem>
          )}

          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive-soft"
                onSelect={(event) => {
                  event.preventDefault();
                  setConfirming(true);
                }}
              >
                <ACTIONS.delete className="size-4" />
                Delete appointment
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this appointment?</DialogTitle>
            <DialogDescription>
              Canceling keeps it on the calendar as a record of the no-show.
              Deleting removes it as though it was never booked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await deleteAppointmentAction(appointmentId);
                setBusy(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Appointment deleted.");
                setConfirming(false);
                router.refresh();
              }}
            >
              <ACTIONS.delete />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
