"use client";

import * as React from "react";
import { useActionState } from "react";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";

import {
  receivePurchaseOrderAction,
  type PoActionState,
} from "@/app/(app)/inventory/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { parseSerialList } from "@/lib/serials";
import { SerialScanField } from "./serial-scan-field";

/** One outstanding line, as the receive form needs it. */
export type ReceivableLine = {
  id: string;
  description: string;
  quantity: number;
  receivedQty: number;
  serialized: boolean;
};

const EMPTY: PoActionState = {};

/**
 * "Receive" — the moment a box turns into stock.
 *
 * Every outstanding line starts pre-filled with everything still owed, because
 * a complete delivery is the common case and the exception is the one worth
 * typing. A serialized line additionally wants one serial per unit; the count
 * is checked here for a friendly message and again on the server, which is the
 * check that actually holds.
 */
export function ReceivePoDialog({
  purchaseOrderId,
  lines,
  trigger,
}: {
  purchaseOrderId: string;
  lines: ReceivableLine[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const outstanding = lines.filter((line) => line.quantity > line.receivedQty);

  const [quantities, setQuantities] = React.useState<Record<string, string>>(() =>
    seedQuantities(outstanding),
  );
  const [serials, setSerials] = React.useState<Record<string, string>>({});

  const [state, formAction, pending] = useActionState(
    async (previous: PoActionState, formData: FormData): Promise<PoActionState> => {
      const result = await receivePurchaseOrderAction(
        purchaseOrderId,
        previous,
        formData,
      );
      if (result.ok) {
        setOpen(false);
        setSerials({});
        toast.success("Received — stock and costs updated");
      }
      return result;
    },
    EMPTY,
  );

  // A serial count that doesn't match the quantity is the one mistake worth
  // catching before the round trip, because the fix is right there on screen.
  const mismatch = outstanding.find((line) => {
    if (!line.serialized) return false;
    const qty = numberOf(quantities[line.id]);
    if (qty === 0) return false;
    return parseSerialList(serials[line.id] ?? "").length !== qty;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuantities(seedQuantities(outstanding));
          setSerials({});
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive this order</DialogTitle>
          <DialogDescription>
            Enter what actually turned up — scan the serials straight off the box
            if you like. Stock, costs and the adjustment log all move together.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
            {outstanding.map((line) => {
              const remaining = line.quantity - line.receivedQty;
              const qty = numberOf(quantities[line.id]);
              const pasted = parseSerialList(serials[line.id] ?? "").length;
              const bad = line.serialized && qty > 0 && pasted !== qty;

              return (
                <div key={line.id} className="flex flex-col gap-3 px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {line.description}
                      </span>
                      <span className="text-[13px] text-muted-foreground tabular-nums">
                        {line.receivedQty} of {line.quantity} received ·{" "}
                        {remaining} outstanding
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Label
                        htmlFor={`qty-${line.id}`}
                        className="text-[13px] text-muted-foreground"
                      >
                        Received
                      </Label>
                      <Input
                        id={`qty-${line.id}`}
                        name={`qty-${line.id}`}
                        type="number"
                        min={0}
                        max={remaining}
                        step={1}
                        inputMode="numeric"
                        value={quantities[line.id] ?? ""}
                        onChange={(event) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [line.id]: event.target.value,
                          }))
                        }
                        className="w-24 text-right tabular-nums"
                      />
                    </div>
                  </div>

                  {line.serialized ? (
                    <SerialScanField
                      id={`serials-${line.id}`}
                      name={`serials-${line.id}`}
                      rows={Math.min(6, Math.max(2, qty))}
                      value={serials[line.id] ?? ""}
                      onChange={(next) =>
                        setSerials((prev) => ({ ...prev, [line.id]: next }))
                      }
                      invalid={bad}
                      hint={
                        <p
                          className={cn(
                            "text-[13px] tabular-nums",
                            bad
                              ? "font-medium text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {pasted} of {qty} serial{qty === 1 ? "" : "s"} entered
                        </p>
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || Boolean(mismatch)}>
              <PackageCheck className="size-4" />
              {pending ? "Receiving…" : "Receive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function seedQuantities(lines: ReceivableLine[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    out[line.id] = String(line.quantity - line.receivedQty);
  }
  return out;
}

function numberOf(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
