"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setVendorActiveAction } from "@/app/(app)/inventory/vendors/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/components/ui/icons";
import { FOOTER_ACTION } from "./record-with-actions";
import { VendorDialog, type VendorFormValues } from "./vendor-dialog";

/**
 * Edit and Deactivate / Reactivate for one supplier.
 *
 * Renders two sibling buttons. `strip` is the Easy-mode list look: full-height
 * ghost buttons for the footer of a RecordWithActions card. `easy` is the
 * Easy-mode supplier page: 48px outline / quiet buttons beside "New order".
 * Without either they are the small buttons the dense card grid has always used.
 *
 * Deactivating asks first: it hides the supplier from new orders, and a one-tap
 * mistake on a card is easy to make with a thumb.
 */
export function VendorActions({
  vendor,
  strip = false,
  easy = false,
}: {
  vendor: VendorFormValues;
  strip?: boolean;
  easy?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const words = strip || easy;

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setVendorActiveAction(vendor.id, !vendor.active);
      setConfirming(false);
      if (result.error) toast.error(result.error);
      else toast.success(vendor.active ? `${vendor.name} deactivated.` : `${vendor.name} reactivated.`);
    });
  };

  const big = easy ? "h-12 px-5 text-base [&_svg]:size-5" : undefined;

  return (
    <>
      <VendorDialog
        vendor={vendor}
        easy={words}
        trigger={
          <Button
            variant={strip ? "ghost" : "outline"}
            size={strip || easy ? "default" : "sm"}
            className={strip ? cn(FOOTER_ACTION, "text-foreground") : easy ? big : "flex-1"}
          >
            <ACTIONS.edit className="size-4" />
            Edit
          </Button>
        }
      />
      <Button
        variant="ghost"
        size={strip || easy ? "default" : "sm"}
        disabled={pending}
        onClick={() => (vendor.active ? setConfirming(true) : toggleActive())}
        className={cn(
          strip ? FOOTER_ACTION : easy ? big : "flex-1",
          vendor.active
            ? strip || easy
              ? "text-muted-foreground hover:text-destructive"
              : "text-faint-foreground hover:text-destructive"
            : "text-accent-soft-foreground",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : vendor.active ? (
          <ACTIONS.archive className="size-4" />
        ) : (
          <ACTIONS.retry className="size-4" />
        )}
        {vendor.active ? "Deactivate" : "Reactivate"}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">Deactivate {vendor.name}?</DialogTitle>
            <DialogDescription className="text-[15px]">
              They will not be offered for new orders. Their past orders stay on file, and you can reactivate them at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="h-12 px-5 text-base" disabled={pending} onClick={() => setConfirming(false)}>
              Keep them
            </Button>
            <Button type="button" variant="destructive" className="h-12 px-5 text-base" disabled={pending} onClick={toggleActive}>
              {pending ? <Loader2 className="animate-spin" /> : <ACTIONS.archive />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
