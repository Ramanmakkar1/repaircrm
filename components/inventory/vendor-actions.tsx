"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setVendorActiveAction } from "@/app/(app)/inventory/vendors/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { FOOTER_ACTION } from "./record-with-actions";
import { VendorDialog, type VendorFormValues } from "./vendor-dialog";

/**
 * Edit and Deactivate / Reactivate for one vendor: the two things the list lets
 * you do without opening the vendor. Deactivating lives only here (the vendor's
 * own page can edit but not retire), so every vendor list layout has to carry it.
 *
 * Renders two sibling buttons that share the row. `strip` is the Easy-mode look:
 * full-height ghost buttons for the footer of a RecordWithActions card. Without
 * it they are the small buttons the dense card grid has always used.
 */
export function VendorActions({ vendor, strip = false }: { vendor: VendorFormValues; strip?: boolean }) {
  const [pending, startTransition] = React.useTransition();

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setVendorActiveAction(vendor.id, !vendor.active);
      if (result.error) toast.error(result.error);
      else toast.success(vendor.active ? `${vendor.name} deactivated.` : `${vendor.name} reactivated.`);
    });
  };

  return (
    <>
      <VendorDialog
        vendor={vendor}
        trigger={
          <Button
            variant={strip ? "ghost" : "outline"}
            size={strip ? "default" : "sm"}
            className={strip ? cn(FOOTER_ACTION, "text-foreground") : "flex-1"}
          >
            <ACTIONS.edit className="size-4" />
            Edit
          </Button>
        }
      />
      <Button
        variant="ghost"
        size={strip ? "default" : "sm"}
        disabled={pending}
        onClick={toggleActive}
        className={cn(
          strip ? FOOTER_ACTION : "flex-1",
          vendor.active
            ? strip
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
    </>
  );
}
