"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// TriangleAlert is a state, not a verb; the verbs come from ACTIONS.
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { deleteCustomerAction } from "@/app/(app)/customers/actions";
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

/**
 * Overflow menu on the customer hub.
 *
 * `canDelete` mirrors the OWNER check the server action enforces, and
 * `blockedReason` is precomputed from the ticket/invoice/estimate counts so the
 * dialog can explain *why* deletion is unavailable instead of just failing.
 */
export function CustomerActionsMenu({
  customerId,
  customerName,
  canDelete,
  blockedReason,
}: {
  customerId: string;
  customerName: string;
  canDelete: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteCustomerAction(customerId);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${customerName} deleted.`);
    setConfirming(false);
    router.push("/customers");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <ACTIONS.more className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/customers/${customerId}/edit`}>
              <ACTIONS.edit className="size-4 text-muted-foreground" />
              Edit customer
            </Link>
          </DropdownMenuItem>
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
                Delete customer
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {customerName}?</DialogTitle>
            <DialogDescription>
              {blockedReason
                ? "This customer still has records attached."
                : "Their contacts, devices and communication history go with them. This can't be undone."}
            </DialogDescription>
          </DialogHeader>

          {blockedReason ? (
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-hover px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-in-progress" />
              <span>{blockedReason}</span>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              {blockedReason ? "Close" : "Cancel"}
            </Button>
            {blockedReason ? null : (
              <Button variant="destructive" disabled={busy} onClick={remove}>
                <ACTIONS.delete />
              {busy ? "Deleting…" : "Delete customer"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
