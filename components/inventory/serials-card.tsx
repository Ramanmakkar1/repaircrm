"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";

import {
  addSerialsAction,
  setSerialStatusAction,
  type InventoryActionState,
} from "@/app/(app)/inventory/actions";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { parseSerialList } from "@/lib/serials";
import { SERIAL_STATUS_META } from "./purchasing";
import { SerialScanField } from "./serial-scan-field";

/** One physical unit, flattened for the client (dates pre-formatted). */
export type SerialRow = {
  id: string;
  serial: string;
  status: string;
  receivedLabel: string;
  soldLabel: string | null;
  notes: string | null;
  invoice: { id: string; number: number } | null;
};

const EMPTY: InventoryActionState = {};

/** The order the table groups by: what you can sell first, write-offs last. */
const ORDER = ["IN_STOCK", "RETURNED", "DEFECTIVE", "SOLD"];

/**
 * Every unit of a serialized product, and where each one is.
 *
 * This is the whole point of serial tracking: "which handset did Mrs Alvarez
 * get?" is answered by the SOLD row's invoice link, and "how many can I
 * actually sell?" is the IN_STOCK count — which is also, by construction, the
 * product's on-hand level.
 */
export function SerialsCard({
  productId,
  serials,
}: {
  productId: string;
  serials: SerialRow[];
}) {
  const [busy, startTransition] = React.useTransition();

  const sorted = React.useMemo(
    () =>
      [...serials].sort((a, b) => {
        const rank = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
        return rank !== 0 ? rank : a.serial.localeCompare(b.serial);
      }),
    [serials],
  );

  const inStock = serials.filter((unit) => unit.status === "IN_STOCK").length;

  const setStatus = (serialId: string, status: string, label: string) =>
    startTransition(async () => {
      const result = await setSerialStatusAction(serialId, status, null);
      if (result.error) toast.error(result.error);
      else toast.success(label);
    });

  return (
    <Card>
      <CardHeader
        icon={ICONS.serial}
        title="Serial numbers"
        description={
          serials.length === 0
            ? "Every unit of this product, tracked individually."
            : `${inStock} of ${serials.length} unit${serials.length === 1 ? "" : "s"} in stock.`
        }
        action={<AddSerialsDialog productId={productId} />}
      />

      <CardContent className="px-0 py-0">
        {serials.length === 0 ? (
          <EmptyState
            icon={ICONS.serial}
            title="No units yet"
            hint="Add the serial numbers on the shelf, or receive a purchase order — either way each unit gets its own record."
            action={<AddSerialsDialog productId={productId} />}
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Serial</Th>
                <Th>Status</Th>
                <Th>Received</Th>
                <Th>Sold</Th>
                <Th className="w-12" />
              </Tr>
            </THead>
            <TBody>
              {sorted.map((unit) => {
                // A status the vocabulary doesn't know about still gets a pill,
                // in grey, showing whatever the database actually holds.
                const meta = SERIAL_STATUS_META[unit.status] ?? {
                  label: unit.status,
                  tone: "neutral" as const,
                };
                return (
                  <Tr key={unit.id}>
                    <Td className="font-mono text-[13.5px] font-semibold text-foreground">
                      {unit.serial}
                      {unit.notes ? (
                        <span className="ml-2 font-sans text-[12.5px] font-normal text-muted-foreground">
                          {unit.notes}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusPill tone={meta.tone} label={meta.label} size="sm" />
                    </Td>
                    <Td className="text-[13.5px] text-muted-foreground">
                      {unit.receivedLabel}
                    </Td>
                    <Td className="text-[13.5px] text-muted-foreground">
                      {unit.invoice ? (
                        <Link
                          href={`/invoices/${unit.invoice.id}`}
                          className="font-semibold text-accent-soft-foreground tabular-nums hover:underline"
                        >
                          #{unit.invoice.number}
                        </Link>
                      ) : (
                        (unit.soldLabel ?? "—")
                      )}
                    </Td>
                    <Td className="text-right">
                      {unit.status === "SOLD" ? null : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              aria-label={`Actions for ${unit.serial}`}
                            >
                              <ACTIONS.more />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {unit.status !== "IN_STOCK" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "IN_STOCK", "Put back in stock.")
                                }
                              >
                                Back in stock
                              </DropdownMenuItem>
                            ) : null}
                            {unit.status !== "DEFECTIVE" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "DEFECTIVE", "Marked defective.")
                                }
                              >
                                Mark defective
                              </DropdownMenuItem>
                            ) : null}
                            {unit.status !== "RETURNED" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "RETURNED", "Marked returned.")
                                }
                              >
                                Mark returned
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/** Paste a batch of serials straight onto the shelf. */
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
        <Button variant="outline" size="sm">
          <ACTIONS.add className="size-4" />
          Add Serials
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add serial numbers</DialogTitle>
          <DialogDescription>
            Scan them one after another, or paste a packing slip. Each becomes a
            unit in stock, and the total is recorded as a stock adjustment.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          {/* The label row carries the scan control: each camera read appends
              one more line to the box below, which is how a batch of units
              gets captured without a laser gun. */}
          <SerialScanField
            id="add-serials"
            name="serials"
            label="Serial numbers"
            rows={6}
            autoFocus
            value={pasted}
            onChange={setPasted}
            hint={
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {count} unit{count === 1 ? "" : "s"} will be added.
              </p>
            }
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="add-serials-note">Note</Label>
            <Input
              id="add-serials-note"
              name="note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional — where these came from"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton disabled={count === 0} pendingLabel="Saving…">
              {`Add ${count || ""} unit${count === 1 ? "" : "s"}`}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
