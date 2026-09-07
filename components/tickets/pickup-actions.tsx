"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
// BellRing is "tell the customer", which is not one of the shared verbs.
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import {
  markPickedUpAction,
  notifyReadyForPickupAction,
} from "@/app/(app)/tickets/actions";
import { READY_FOR_PICKUP_STATUS, RESOLVED_STATUS } from "./ticket-meta";
import { useSetOptimisticStatus } from "./ticket-status";

/**
 * The two presses that close out a repair at the counter.
 *
 * "Notify: ready for pickup" is the prominent one — it is the single most
 * repeated action in a shop's day, and burying it inside the update composer
 * (pick a status, write a note, tick "customer-facing") is three decisions
 * where there is only one. It disappears once the ticket is already ready, so
 * nobody texts the same customer twice.
 *
 * "Mark picked up" only appears once the device is on the shelf, because until
 * then there is nothing to collect.
 */
export function PickupActions({
  ticketId,
  isReady,
  pickedUp,
}: {
  ticketId: string;
  /** Ticket is in the Ready for Pickup state. */
  isReady: boolean;
  /** `pickedUpAt` is already stamped. */
  pickedUp: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"notify" | "pickup" | null>(null);
  const [, startTransition] = React.useTransition();
  /*
   * Both presses move the status, and both are pressed at a counter with a
   * customer standing at it — so the badge and the tracker follow the press,
   * not the round trip. The guess is scoped to the transition below and falls
   * away on its own when the write settles, refused or not.
   */
  const setOptimisticStatus = useSetOptimisticStatus();

  if (pickedUp) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md bg-status-resolved-bg px-3 py-2 text-[13.5px] font-semibold text-status-resolved-fg">
        <ACTIONS.receive className="size-4" />
        Picked up
      </span>
    );
  }

  function notify() {
    setBusy("notify");
    startTransition(async () => {
      setOptimisticStatus(READY_FOR_PICKUP_STATUS);
      const result = await notifyReadyForPickupAction(ticketId);
      setBusy(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer told it's ready for pickup.");
      router.refresh();
    });
  }

  function collect() {
    setBusy("pickup");
    startTransition(async () => {
      setOptimisticStatus(RESOLVED_STATUS);
      const result = await markPickedUpAction(ticketId);
      setBusy(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Marked picked up and closed.");
      router.refresh();
    });
  }

  if (isReady) {
    return (
      <Button size="sm" variant="soft" disabled={busy !== null} onClick={collect}>
        <ACTIONS.receive className="size-4" />
        {busy === "pickup" ? "Closing…" : "Mark picked up"}
      </Button>
    );
  }

  return (
    <Button size="sm" disabled={busy !== null} onClick={notify}>
      <BellRing className="size-4" />
      {busy === "notify" ? "Sending…" : "Notify: ready for pickup"}
    </Button>
  );
}
