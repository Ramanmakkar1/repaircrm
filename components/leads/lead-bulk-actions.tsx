"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { bulkLeadStatusAction } from "@/app/(app)/leads/actions";
import { useRowSelection } from "@/components/list/selection";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import type { BulkResult } from "@/lib/bulk";

/**
 * Two verbs for a batch of enquiries: move them, or get them out of the inbox.
 *
 * The status menu offers only the two OPEN states. Closing is the Archive
 * button beside it — the same act, given the name a front desk uses for it —
 * and Converted is offered nowhere, because converting builds a customer and a
 * numbered ticket per lead and is not something a menu item can do to forty
 * rows. Both controls call one server action, which is also the only place the
 * allowed set is enforced.
 */
export function LeadBulkActions() {
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
    selection.clear();
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <ICONS.checklist />
            Status
          </Button>
        </DropdownMenuTrigger>
        {/* Escape closes the menu; the action bar's own Escape would also
            throw the selection away. */}
        <DropdownMenuContent
          align="start"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => void run(() => bulkLeadStatusAction(ids, "NEW"))}
          >
            New
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void run(() => bulkLeadStatusAction(ids, "CONTACTED"))}
          >
            Contacted
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void run(() => bulkLeadStatusAction(ids, "CLOSED"))}
      >
        <ACTIONS.archive />
        Archive
      </Button>
    </>
  );
}
