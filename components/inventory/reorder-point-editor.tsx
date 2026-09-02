"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  setLowStockAction,
  type InventoryActionState,
} from "@/app/(app)/inventory/actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const EMPTY: InventoryActionState = {};

/**
 * Inline quick-edit for the reorder point.
 *
 * The threshold is the one field people want to change while looking at a
 * stock level ("this keeps running out — warn me at 5"), so it gets an inline
 * pencil rather than a trip through the full edit form.
 */
export function ReorderPointEditor({
  productId,
  lowStockAt,
}: {
  productId: string;
  lowStockAt: number | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(
    lowStockAt == null ? "" : String(lowStockAt),
  );

  // Re-sync when the server sends a fresh value back after a save. Adjusted
  // during render rather than in an effect, so no stale value is ever painted.
  const [lastSaved, setLastSaved] = React.useState(lowStockAt);
  if (lastSaved !== lowStockAt) {
    setLastSaved(lowStockAt);
    setValue(lowStockAt == null ? "" : String(lowStockAt));
  }

  const [state, formAction, pending] = useActionState(
    async (
      previous: InventoryActionState,
      formData: FormData,
    ): Promise<InventoryActionState> => {
      const result = await setLowStockAction(productId, previous, formData);
      if (result.ok) {
        setEditing(false);
        toast.success("Reorder point updated.");
      }
      return result;
    },
    EMPTY,
  );

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-muted-foreground">
            Reorder point
          </span>
          <span className="text-[15px] font-bold text-foreground tabular-nums">
            {lowStockAt == null ? "Not tracked" : lowStockAt}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          <ACTIONS.edit />
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label
        htmlFor="reorder-point"
        className="text-[13px] font-semibold text-muted-foreground"
      >
        Reorder point
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="reorder-point"
          name="lowStockAt"
          type="number"
          step={1}
          min={0}
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Blank = not tracked"
          className="tabular-nums"
        />
        {/* Two icon buttons rather than two words, because they sit inline
            beside a narrow number field — each carries its label and tip. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              size="icon"
              disabled={pending}
              aria-label="Save reorder point"
            >
              {pending ? <Loader2 className="animate-spin" /> : <ACTIONS.save />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save reorder point</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={pending}
              onClick={() => {
                setValue(lowStockAt == null ? "" : String(lowStockAt));
                setEditing(false);
              }}
              aria-label="Cancel"
            >
              <ACTIONS.cancel />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cancel</TooltipContent>
        </Tooltip>
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
