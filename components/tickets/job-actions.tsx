"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
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
  markPickedUpAction,
  notifyReadyForPickupAction,
  postUpdateAction,
} from "@/app/(app)/tickets/actions";
import { EMPTY_STATE } from "./action-state";
import type { Canned } from "./canned-manager";
import { sheetShortcut } from "./job-screen-logic";
import { READY_FOR_PICKUP_STATUS, RESOLVED_STATUS } from "./ticket-meta";
import { useSetOptimisticStatus, useTicketStatus } from "./ticket-status";
import { UpdateComposer } from "./update-composer";

/**
 * Every press on the repair screen that changes what state the repair is in.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE PROVIDER
 * ---------------------------------------------------------------------------
 * The status pills, the big action button (rendered twice: in the side column on
 * a tablet, pinned above the tab bar on a phone) and the Reopen button all end
 * in the same few sheets. One provider owns them, so each is mounted once and
 * the buttons only ask for it.
 *
 * Nothing here is a new rule. A status move is `postUpdateAction`, the same
 * action the update composer posts; the pickup notice and the hand-over are
 * `notifyReadyForPickupAction` and `markPickedUpAction`, the same ones the
 * pickup buttons press. What is new is only WHERE the confirmation shows: in a
 * sheet, so a press that sends a message or closes the repair is never silent.
 */

type JobActionsValue = {
  /** The status being shown right now (a press paints ahead of the round trip). */
  status: string;
  /** A write is in flight. */
  busy: boolean;
  /** A plain move with no note and no message: Start repair, Resume repair. */
  changeStatus: (target: string) => void;
  /** The status sheet: an optional note, an optional message to the customer, then the move. */
  openStatus: (target: string) => void;
  /** "Tell the customer it is ready" confirmation. */
  openReady: () => void;
  /** "The customer collected it" confirmation. */
  openHandover: () => void;
};

const JobActionsContext = React.createContext<JobActionsValue | null>(null);

export function useJobActions(): JobActionsValue {
  const value = React.useContext(JobActionsContext);
  if (!value) throw new Error("useJobActions must be used inside <JobActionsProvider>.");
  return value;
}

type SheetKind = "status" | "ready" | "handover";

export function JobActionsProvider({
  ticketId,
  status,
  statuses,
  pickedUp,
  customerName,
  customerEmail,
  cannedResponses,
  children,
}: {
  ticketId: string;
  /** The server's status; the provider paints the optimistic one on top. */
  status: string;
  statuses: string[];
  pickedUp: boolean;
  /** First name, for "Tell Owen it is ready". */
  customerName: string;
  customerEmail: string | null;
  cannedResponses: Canned[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const liveStatus = useTicketStatus(status);
  const setOptimisticStatus = useSetOptimisticStatus();
  const [sheet, setSheet] = React.useState<SheetKind | null>(null);
  // Kept after the sheet closes, so the words do not change while it fades out.
  const [target, setTarget] = React.useState(status);
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const readyStatus =
    statuses.find((s) => s.trim().toLowerCase() === READY_FOR_PICKUP_STATUS.toLowerCase()) ??
    READY_FOR_PICKUP_STATUS;

  const changeStatus = React.useCallback(
    (target: string) => {
      setBusy(true);
      startTransition(async () => {
        setOptimisticStatus(target);
        const body = new FormData();
        body.set("status", target);
        const result = await postUpdateAction(ticketId, EMPTY_STATE, body);
        setBusy(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`Moved to ${target}.`);
      });
    },
    [ticketId, setOptimisticStatus],
  );

  /** The pickup notice: marks it ready AND tells the customer. Same toasts the pickup button has. */
  function notify() {
    setBusy(true);
    setSheet(null);
    startTransition(async () => {
      setOptimisticStatus(READY_FOR_PICKUP_STATUS);
      const result = await notifyReadyForPickupAction(ticketId);
      setBusy(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.notice) toast.warning(result.notice, { duration: 12_000 });
      else toast.success(result.done ?? "Marked ready for pickup.");
      router.refresh();
    });
  }

  /** Hand-over: stamps the pickup and closes the repair. */
  function handOver() {
    setBusy(true);
    setSheet(null);
    startTransition(async () => {
      setOptimisticStatus(RESOLVED_STATUS);
      const result = await markPickedUpAction(ticketId);
      setBusy(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked picked up and closed.");
      router.refresh();
    });
  }

  const value = React.useMemo<JobActionsValue>(
    () => ({
      status: liveStatus,
      busy,
      changeStatus,
      openStatus: (next) => {
        setTarget(next);
        setSheet("status");
      },
      openReady: () => setSheet("ready"),
      openHandover: () => setSheet("handover"),
    }),
    [liveStatus, busy, changeStatus],
  );

  const close = () => setSheet(null);
  const shortcut = sheetShortcut(target, status, pickedUp);

  return (
    <JobActionsContext.Provider value={value}>
      {children}

      {/* A status move: the note (optional) and the message to the customer (optional) ride along. */}
      <Dialog open={sheet === "status"} onOpenChange={(open) => !open && close()}>
        <DialogContent
          className="max-h-[90dvh] max-w-lg overflow-y-auto"
          // Focus starts on the sheet's title, not on its first button: that is the
          // "Mark ready and tell Owen" shortcut, which a stray Enter (or a barcode
          // scanner's Enter) would otherwise press, texting the customer. The title
          // also does not pop the on-screen keyboard over the sheet the way the
          // note field would; one Tab reaches the buttons and the note.
          onOpenAutoFocus={(event) => {
            const title = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-sheet-title]");
            if (!title) return;
            event.preventDefault();
            title.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle data-sheet-title tabIndex={-1} className="text-xl outline-none">
              Move to {target}?
            </DialogTitle>
            <DialogDescription className="text-sm">
              Add a note if you like. It is saved in Updates with the move.
            </DialogDescription>
          </DialogHeader>

          {shortcut === "notify" ? (
            <ShortcutBlock
              title="Want the customer told too?"
              hint={`Marks it ${readyStatus} and sends the shop's pickup message to ${customerName} by text or email.`}
              action={
                <Button type="button" className="h-12 w-full text-base sm:w-auto" disabled={busy} onClick={notify}>
                  <BellRing aria-hidden />
                  Mark ready and tell {customerName}
                </Button>
              }
            />
          ) : null}
          {shortcut === "handover" ? (
            <ShortcutBlock
              title="Did the customer collect it?"
              hint="Marks it picked up and closes the repair."
              action={
                <Button type="button" className="h-12 w-full text-base sm:w-auto" disabled={busy} onClick={handOver}>
                  <ACTIONS.receive aria-hidden />
                  Hand over to customer
                </Button>
              }
            />
          ) : null}

          <UpdateComposer
            easy
            ticketId={ticketId}
            currentStatus={status}
            fixedStatus={target}
            statuses={statuses}
            cannedResponses={cannedResponses}
            customerEmail={customerEmail}
            onPosted={close}
          />
        </DialogContent>
      </Dialog>

      {/* Tell the customer it is ready. */}
      <Dialog open={sheet === "ready"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Tell {customerName} it is ready?</DialogTitle>
            <DialogDescription className="text-sm">
              This marks the repair {readyStatus} and sends the shop&rsquo;s pickup message by text
              or email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" className="h-12 text-base" onClick={() => {
                setTarget(readyStatus);
                setSheet("status");
              }}>
              Just change the status
            </Button>
            <Button type="button" className="h-12 text-base" disabled={busy} onClick={notify}>
              <BellRing aria-hidden />
              Mark ready and tell {customerName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hand-over closes the repair, so it asks first. */}
      <Dialog open={sheet === "handover"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Hand this repair over?</DialogTitle>
            <DialogDescription className="text-sm">
              This marks it picked up and closes the repair. Do it once the customer has the device in
              their hands.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" className="h-12 text-base" onClick={close}>
              Not yet
            </Button>
            <Button type="button" className="h-12 text-base" disabled={busy} onClick={handOver}>
              <ACTIONS.receive aria-hidden />
              Hand over to customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </JobActionsContext.Provider>
  );
}

/** A one-tap alternative shown above the note: the same button the repair screen already has. */
function ShortcutBlock({ title, hint, action }: { title: string; hint: string; action: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl bg-accent-soft p-4")}>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {action}
    </div>
  );
}
