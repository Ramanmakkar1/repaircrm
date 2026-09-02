"use client";

import * as React from "react";
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

/** Mark done · Cancel · Reopen · Delete, on a list row. */
export function AppointmentRowActions({
  appointmentId,
  status,
  canDelete,
}: {
  appointmentId: string;
  status: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function move(next: string, message: string) {
    setBusy(true);
    const result = await setAppointmentStatusAction(appointmentId, next);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(message);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {status === "SCHEDULED" ? (
          <>
            <Button
              size="sm"
              variant="soft"
              disabled={busy}
              onClick={() => move("DONE", "Marked done.")}
            >
              <ACTIONS.approve />
              Done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => move("CANCELED", "Appointment canceled.")}
            >
              <ACTIONS.decline />
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => move("SCHEDULED", "Back on the calendar.")}
          >
            <ACTIONS.reopen />
            Reopen
          </Button>
        )}

        {canDelete ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            <ACTIONS.delete />
            <span className="sr-only">Delete appointment</span>
          </Button>
        ) : null}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
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
