"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { ScanBarcode } from "lucide-react";
import { toast } from "sonner";

import {
  addSerialsAction,
  setSerialStatusAction,
  type InventoryActionState,
} from "@/app/(app)/inventory/actions";
import { StatusPill } from "@/components/ui/badge";
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
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { parseSerialList } from "@/lib/serials";
import { SERIAL_STATUS_META } from "./purchasing";
import { SerialScanField } from "./serial-scan-field";

/** One physical unit, flattened for the client (dates pre-formatted in the shop's zone). */
export type SerialRow = {
  id: string;
  serial: string;
  status: string;
  receivedLabel: string;
  soldLabel: string | null;
  notes: string | null;
  invoice: { id: string; number: number } | null;
  /** Who bought it, when the sale's invoice names a customer. */
  soldTo?: string | null;
};

const EMPTY: InventoryActionState = {};

/** The order the list groups by: what you can sell first, write-offs last. */
const ORDER = ["IN_STOCK", "RETURNED", "DEFECTIVE", "SOLD"];

/** The moves a unit can make from here, as words on buttons (SOLD only happens by selling). */
const MOVES: { status: string; label: string; done: string }[] = [
  { status: "IN_STOCK", label: "Back on the shelf", done: "Put back in stock." },
  { status: "DEFECTIVE", label: "Faulty", done: "Marked faulty." },
  { status: "RETURNED", label: "Sent back", done: "Marked as sent back." },
];

/**
 * Every unit of a serialized product, and where each one is.
 *
 * This is the whole point of serial tracking: "which handset did Mrs Alvarez
 * get?" is answered on the sold unit's card ("Sold to Priscilla A. · Invoice
 * #1008"), and "how many can I actually sell?" is the in-stock count — which is
 * also, by construction, the product's stock level.
 *
 * Units are cards with their status in words and their moves as visible
 * buttons (no hidden "..." menu). A box on top finds one serial (type it or
 * scan it), and "Scan units in" adds a batch with a running count.
 */
export function SerialsCard({
  productId,
  serials,
}: {
  productId: string;
  serials: SerialRow[];
}) {
  const [busy, startTransition] = React.useTransition();
  const [find, setFind] = React.useState("");

  const sorted = React.useMemo(
    () =>
      [...serials].sort((a, b) => {
        const rank = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
        return rank !== 0 ? rank : a.serial.localeCompare(b.serial);
      }),
    [serials],
  );

  const needle = find.trim().toLowerCase();
  const shown = needle ? sorted.filter((unit) => unit.serial.toLowerCase().includes(needle)) : sorted;
  const inStock = serials.filter((unit) => unit.status === "IN_STOCK").length;

  const setStatus = (serialId: string, status: string, label: string) =>
    startTransition(async () => {
      const result = await setSerialStatusAction(serialId, status, null);
      if (result.error) toast.error(result.error);
      else toast.success(label);
    });

  return (
    <section id="units" aria-labelledby="units-heading" className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="units-heading" className="flex items-center gap-2 text-xl font-semibold">
            <ICONS.serial className="size-5 text-muted-foreground" aria-hidden />
            Units by serial number
          </h2>
          <p className="text-base text-muted-foreground">
            {serials.length === 0
              ? "Each unit of this product is kept by its own serial number."
              : `${inStock} of ${serials.length} ${serials.length === 1 ? "unit is" : "units are"} in stock.`}
          </p>
        </div>
        <AddSerialsDialog productId={productId} />
      </div>

      {serials.length > 0 ? (
        <div className="relative">
          <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
          <Input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Find a serial number"
            placeholder="Find a serial: type or scan it"
            className="h-14 rounded-xl pl-12 font-mono text-base"
          />
        </div>
      ) : null}

      {serials.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-base text-muted-foreground">
          No units yet. Scan them in here, or book in an order that has them.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-6 text-center text-base text-muted-foreground">
          No serial matches “{find.trim()}”.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Units">
          {shown.map((unit) => {
            // A status the vocabulary doesn't know about still gets its word, in grey.
            const meta = SERIAL_STATUS_META[unit.status] ?? { label: unit.status, tone: "neutral" as const };
            const label = unit.status === "DEFECTIVE" ? "Faulty" : unit.status === "RETURNED" ? "Sent back" : meta.label;
            return (
              <li key={unit.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 font-mono text-lg font-semibold [overflow-wrap:anywhere]">{unit.serial}</span>
                  <StatusPill tone={meta.tone} label={label} />
                </div>
                <div className="flex flex-col gap-0.5 text-[15px] text-muted-foreground">
                  <span>In since {unit.receivedLabel}</span>
                  {unit.status === "SOLD" ? (
                    <span>
                      Sold{unit.soldTo ? ` to ${unit.soldTo}` : ""}
                      {unit.soldLabel ? ` · ${unit.soldLabel}` : ""}
                      {unit.invoice ? (
                        <>
                          {" · "}
                          <Link href={`/invoices/${unit.invoice.id}`} className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
                            Invoice #{unit.invoice.number}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {unit.notes ? <span className="[overflow-wrap:anywhere]">{unit.notes}</span> : null}
                </div>
                {unit.status === "SOLD" ? null : (
                  <div className="flex flex-wrap gap-2">
                    {MOVES.filter((move) => move.status !== unit.status).map((move) => (
                      <Button
                        key={move.status}
                        type="button"
                        variant="outline"
                        disabled={busy}
                        className="h-12 px-4 text-[15px]"
                        onClick={() => setStatus(unit.id, move.status, move.done)}
                        aria-label={`${move.label}: ${unit.serial}`}
                      >
                        {move.label}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Scan a batch of serials straight onto the shelf, with a running count. */
function AddSerialsDialog({ productId }: { productId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [note, setNote] = React.useState("");

  const [state, formAction] = useActionState(
    async (
      previous: InventoryActionState,
      formData: FormData,
    ): Promise<InventoryActionState> => {
      const result = await addSerialsAction(productId, previous, formData);
      if (result.ok) {
        setOpen(false);
        setPasted("");
        setNote("");
        toast.success("Units added to stock.");
      }
      return result;
    },
    EMPTY,
  );

  const count = parseSerialList(pasted).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPasted("");
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-12 px-5 text-base [&_svg]:size-5">
          <ACTIONS.scan />
          Scan units in
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Scan units in</DialogTitle>
          <DialogDescription className="text-[15px]">
            Scan each unit, one after another, or paste the list from the packing slip.
            Each one goes on the shelf as its own unit.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <SerialScanField
            id="add-serials"
            name="serials"
            label="Serial numbers"
            autoFocus
            value={pasted}
            onChange={setPasted}
            hint={
              <p className="rf-num text-base font-semibold tabular-nums" aria-live="polite">
                {count === 0 ? "Nothing scanned yet" : `${count} ${count === 1 ? "unit" : "units"} scanned`}
              </p>
            }
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="add-serials-note" className="text-[15px]">
              Where did they come from? <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="add-serials-note"
              name="note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="A trade-in, a supplier…"
              className="h-12 text-base"
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" className="h-12 px-5 text-base" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton disabled={count === 0} pendingLabel="Saving…" className="h-12 px-6 text-base">
              {count === 0 ? "Add units" : `Add ${count} ${count === 1 ? "unit" : "units"}`}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
