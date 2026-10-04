"use client";

import * as React from "react";
import { toast } from "sonner";

import { removeChargeAction, restoreChargeAction } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { toastWithUndo } from "@/components/ui/undo-toast";

/**
 * The bin on a charge that is not on an invoice yet: one tap removes it, and
 * the toast that says so carries "Undo" for eight seconds.
 *
 * It used to be a bare form post with no confirm and no way back, so a thumb
 * that landed on the bin instead of the pencil lost a line from the bill. The
 * undo is real: `removeChargeAction` hands back exactly what the row held (the
 * cents as stored, the product, the time it was added) and
 * `restoreChargeAction` writes it back to the same repair, re-checked against
 * this shop. A charge that is on an invoice has no bin at all.
 */
export function ChargeRemoveButton({ chargeId, description }: { chargeId: string; description: string }) {
  const [pending, startTransition] = React.useTransition();

  function remove() {
    startTransition(async () => {
      try {
        const result = await removeChargeAction(chargeId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toastWithUndo({
          message: `Removed "${result.removed.description}".`,
          undo: async () => {
            const restored = await restoreChargeAction(result.removed);
            if (restored.error) throw new Error(restored.error);
          },
          onUndoError: "Could not put that charge back.",
        });
      } catch {
        toast.error("Could not remove that charge. Check the connection and try again.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Remove ${description}`}
      disabled={pending}
      onClick={remove}
      className="text-faint-foreground hover:text-destructive"
    >
      <ACTIONS.delete className="size-4" />
    </Button>
  );
}
