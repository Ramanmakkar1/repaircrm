"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setTicketLocationAction } from "@/app/(app)/tickets/location-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TicketLocationOption = { id: string; name: string };

/**
 * Which branch a ticket belongs to, changeable in place.
 *
 * Rendered by the ticket page only when the shop has two or more branches; a
 * single-location shop just reads the name as plain text and is never offered
 * a control with one option in it.
 */
export function TicketLocation({
  ticketId,
  locationId,
  locations,
}: {
  ticketId: string;
  locationId: string | null;
  locations: TicketLocationOption[];
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(locationId ?? "");
  const [busy, setBusy] = React.useState(false);

  // Follow the server after a move: adjusted during render, not in an effect.
  const [seed, setSeed] = React.useState(locationId);
  if (seed !== locationId) {
    setSeed(locationId);
    setValue(locationId ?? "");
  }

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    const result = await setTicketLocationAction(ticketId, next);
    setBusy(false);

    if (result.error) {
      setValue(previous);
      toast.error(result.error);
      return;
    }
    toast.success("Ticket moved.");
    router.refresh();
  }

  return (
    <Select value={value} onValueChange={change} disabled={busy}>
      <SelectTrigger
        aria-label="Location"
        className="h-8 border-0 bg-surface-hover px-2.5 text-[13.5px] font-semibold"
      >
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
