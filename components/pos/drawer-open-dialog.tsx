"use client";

import * as React from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

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
import { formatCents, parseCents } from "@/lib/money";
import { openDrawerAction } from "@/app/(app)/pos/drawers/actions";

/** Common starting floats, so the usual case is one tap rather than typing. */
const QUICK_FLOATS = [10000, 15000, 20000, 30000];

/**
 * "Open drawer" — the float that is physically in the till right now.
 *
 * The number matters: it is the baseline every count for the rest of the shift
 * is measured against, so getting it wrong at 9am is a phantom shortfall at
 * closing. Hence the quick amounts and the live formatted echo underneath.
 */
export function DrawerOpenDialog({ onOpened }: { onOpened: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("150.00");
  const [busy, setBusy] = React.useState(false);

  const cents = parseCents(value);

  async function submit() {
    setBusy(true);
    const result = await openDrawerAction(cents);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    onOpened();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Banknote className="size-4" />
          Open drawer
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Open the drawer</DialogTitle>
          <DialogDescription>
            Count the float that&rsquo;s in the till. Everything tonight is
            measured against this number.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drawer-float">Opening float</Label>
            <Input
              id="drawer-float"
              value={value}
              inputMode="decimal"
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !busy) void submit();
              }}
            />
            <p className="text-[12.5px] text-muted-foreground">
              Starting with {formatCents(cents)}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_FLOATS.map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValue((amount / 100).toFixed(2))}
              >
                {formatCents(amount)}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Opening…" : "Open drawer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
