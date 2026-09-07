"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkAssignTicketsAction,
  bulkTicketStatusAction,
} from "@/app/(app)/tickets/actions";
import { useRowSelection } from "@/components/list/selection";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import type { BulkResult } from "@/lib/bulk";

/**
 * What a shop actually does to a handful of tickets at once.
 *
 * Three verbs, and they are the three a front desk repeats all day: hand a
 * morning's intake to whoever is on the bench, move a batch that came off it to
 * Ready for Pickup, and print the stack of work orders that goes with them.
 *
 * Everything here is a thin trigger. The server actions do the deciding — the
 * technician is re-resolved against this shop's roster, the status is checked
 * against the shop's own list, and the count in the toast is the count the
 * database reported, not the number of rows that happened to be ticked. A
 * selection that has gone stale (someone else moved three of them) therefore
 * reports what really changed rather than what was asked for.
 */
export function TicketBulkActions({
  techs,
  statuses,
}: {
  /** Active team members, exactly the set the server action will accept. */
  techs: { id: string; name: string }[];
  /** The shop's own status list — `ticketStatuses(shop.settings)`. */
  statuses: string[];
}) {
  const selection = useRowSelection();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const ids = [...selection.selected];

  async function run(work: () => Promise<BulkResult>) {
    setBusy(true);
    const result = await work();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    // The rows have moved; keeping them ticked invites a second, pointless
    // pass over the same records.
    selection.clear();
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <ACTIONS.assign />
            Assign
          </Button>
        </DropdownMenuTrigger>
        {/*
          Escape closes the menu and nothing else — the action bar clears the
          selection on Escape, and losing nine ticked rows because you changed
          your mind about which tech is not a trade anyone would make.
        */}
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          {techs.length === 0 ? (
            <DropdownMenuItem disabled>Nobody on the team yet</DropdownMenuItem>
          ) : (
            techs.map((tech) => (
              <DropdownMenuItem
                key={tech.id}
                onSelect={() =>
                  void run(() => bulkAssignTicketsAction(ids, tech.id))
                }
              >
                {tech.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void run(() => bulkAssignTicketsAction(ids, null))}
          >
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <ICONS.checklist />
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {statuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onSelect={() =>
                void run(() => bulkTicketStatusAction(ids, status))
              }
            >
              {status}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        A link, not an action: printing reads, it does not write. New tab so the
        selection and the filters the operator built are still there when the
        print dialog is dismissed.
      */}
      <Button size="sm" variant="outline" asChild>
        <Link
          href={`/print/tickets?ids=${ids.join(",")}`}
          target="_blank"
          rel="noopener"
        >
          <ACTIONS.print />
          Print work orders
        </Link>
      </Button>
    </>
  );
}
