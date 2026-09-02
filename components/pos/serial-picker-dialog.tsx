"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { Hash } from "lucide-react";
import type { PosProduct } from "./types";

/**
 * "Which one?" — the serial picker.
 *
 * A serialized product cannot be added to a cart by tapping its tile, because
 * the tile does not say which handset is in the customer's hand. This opens the
 * moment such a tile is tapped and stays out of the way otherwise.
 *
 * The list is searchable because a shelf of forty refurbs is a scroll, and the
 * cashier is usually reading the last four digits off the label — and it is
 * scannable, because the serial is printed as a barcode on most of them and
 * reading it with the camera is the one way to be certain the right handset
 * left the shop.
 */
export function SerialPickerDialog({
  product,
  taken,
  onPick,
  onClose,
}: {
  /** Null closes the dialog. */
  product: PosProduct | null;
  /** Serials already in the cart, so the same unit can't be rung up twice. */
  taken: readonly string[];
  onPick: (serial: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");

  // Reset the search each time a different product opens the picker.
  const [lastId, setLastId] = React.useState<string | null>(null);
  if (product && product.id !== lastId) {
    setLastId(product.id);
    setQuery("");
  }

  const available = (product?.serials ?? []).filter(
    (unit) => !taken.includes(unit.serial),
  );
  const term = query.trim().toLowerCase();
  const matches = term
    ? available.filter((unit) => unit.serial.toLowerCase().includes(term))
    : available;

  return (
    <Dialog open={product !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pick a serial number</DialogTitle>
          <DialogDescription>
            {product?.name} is tracked by serial — choose the unit going out the
            door.
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="No units available"
            hint="Everything in stock is already in this cart, or there is nothing on the shelf. Receive a purchase order to add more."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search serial…"
                  aria-label="Search serial numbers"
                  autoFocus
                  className="pl-11 font-mono"
                />
              </div>
              <ScanButton
                label="Scan this unit's serial"
                title="Scan the unit"
                description="Read the serial off the handset or its box."
                onScan={(hit) => {
                  const scanned = hit.value.trim().toLowerCase();
                  const unit = available.find(
                    (row) => row.serial.toLowerCase() === scanned,
                  );
                  if (!unit) {
                    // Not on this shelf: leave it in the box as a search so a
                    // partial match still narrows the list.
                    setQuery(hit.value);
                    return `${hit.value} is not in stock for this product`;
                  }
                  onPick(unit.serial);
                  return `Picked ${unit.serial}`;
                }}
              />
            </div>

            <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
              {matches.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
                  Nothing matches “{query}”.
                </p>
              ) : (
                matches.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => onPick(unit.serial)}
                    className={cn(
                      "px-4 py-3 text-left font-mono text-[13.5px] font-semibold text-foreground transition-colors",
                      "hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover",
                    )}
                  >
                    {unit.serial}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
