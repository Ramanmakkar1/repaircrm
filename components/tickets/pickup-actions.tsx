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

  if (pickedUp) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md bg-status-resolved-bg px-3 py-2 text-[13.5px] font-semibold text-status-resolved-fg">
        <ACTIONS.receive className="size-4" />
        Picked up
      </span>
    );
  }

  async function notify() {
    setBusy("notify");
    const result = await notifyReadyForPickupAction(ticketId);
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Customer told it's ready for pickup.");
    router.refresh();
  }

  async function collect() {
    setBusy("pickup");
    const result = await markPickedUpAction(ticketId);
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked picked up and closed.");
    router.refresh();
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
