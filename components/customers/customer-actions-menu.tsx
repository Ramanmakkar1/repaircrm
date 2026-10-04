"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// TriangleAlert is a state, not a verb; ScrollText has no concept in the shared
// map; the verbs come from ACTIONS.
import { ScrollText, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { deleteCustomerAction } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { QUICK_TILE_CLASS } from "./quick-tile";
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
 *
 * `easy` is the Easy mode header: the one big "New repair" button stays out
 * front and everything else about the customer (a new invoice or estimate,
 * their statement, edit, delete) lives behind one labelled "More" button.
 *
 * `tile` is the POS-style customer screen: "More" is the last of four quick
 * tiles, and New invoice is a tile of its own, so the menu keeps the rest
 * (estimate, statement, edit, delete) and does not list it twice.
 */
export function CustomerActionsMenu({
  customerId,
  customerName,
  canDelete,
  blockedReason,
  easy = false,
  tile = false,
}: {
  customerId: string;
  customerName: string;
  canDelete: boolean;
  blockedReason: string | null;
  easy?: boolean;
  tile?: boolean;
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
          {tile ? (
            <button type="button" className={QUICK_TILE_CLASS}>
              <ACTIONS.more aria-hidden />
              <span className="text-center leading-tight">More</span>
            </button>
          ) : easy ? (
            <Button variant="outline" size="lg" className="h-14 px-5 text-base">
              <ACTIONS.more className="size-5" />
              More
            </Button>
          ) : (
            // size-8, not the 36px `icon` default: it closes a header row of
            // `sm` buttons and has to end level with them.
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="More actions"
            >
              <ACTIONS.more className="size-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={easy ? "min-w-56" : undefined}>
          {easy ? (
            <>
              {tile ? null : (
                <DropdownMenuItem asChild className="min-h-12 text-base">
                  <Link href={`/invoices/new?customerId=${customerId}`}>
                    <ICONS.invoice className="size-5 text-muted-foreground" />
                    New invoice
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="min-h-12 text-base">
                <Link href={`/estimates/new?customerId=${customerId}`}>
                  <ICONS.estimate className="size-5 text-muted-foreground" />
                  New estimate
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-12 text-base">
                <Link href={`/customers/${customerId}/statement`}>
                  <ScrollText className="size-5 text-muted-foreground" />
                  Statement
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem asChild className={easy ? "min-h-12 text-base" : undefined}>
            <Link href={`/customers/${customerId}/edit`}>
              <ACTIONS.edit className={easy ? "size-5 text-muted-foreground" : "size-4 text-muted-foreground"} />
              Edit customer
            </Link>
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={easy ? "min-h-12 text-base text-destructive focus:bg-destructive-soft" : "text-destructive focus:bg-destructive-soft"}
                onSelect={(event) => {
                  event.preventDefault();
                  setConfirming(true);
                }}
              >
                <ACTIONS.delete className={easy ? "size-5" : "size-4"} />
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
