"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Hash, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  addSerialsAction,
  setSerialStatusAction,
  type InventoryActionState,
} from "@/app/(app)/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TBody, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseSerialList } from "@/lib/serials";
import { SERIAL_STATUS_META } from "./purchasing";

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
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Serial numbers</CardTitle>
          <CardDescription className="tabular-nums">
            {serials.length === 0
              ? "Every unit of this product, tracked individually."
              : `${inStock} of ${serials.length} unit${serials.length === 1 ? "" : "s"} in stock.`}
          </CardDescription>
        </div>
        <AddSerialsDialog productId={productId} />
      </CardHeader>

      <CardContent className="px-0 py-0">
        {serials.length === 0 ? (
          <EmptyState
            icon={Hash}
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
                const meta = SERIAL_STATUS_META[unit.status] ?? {
                  label: unit.status,
                  chip: "bg-surface-hover text-muted-foreground",
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
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
                          meta.chip,
                        )}
                      >
                        {meta.label}
                      </span>
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
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {unit.status !== "IN_STOCK" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "IN_STOCK", "Back in stock")
                                }
                              >
                                Back in stock
                              </DropdownMenuItem>
                            ) : null}
                            {unit.status !== "DEFECTIVE" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "DEFECTIVE", "Marked defective")
                                }
                              >
                                Mark defective
                              </DropdownMenuItem>
                            ) : null}
                            {unit.status !== "RETURNED" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setStatus(unit.id, "RETURNED", "Marked returned")
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

  const [state, formAction, pending] = useActionState(
    async (
      previous: InventoryActionState,
      formData: FormData,
    ): Promise<InventoryActionState> => {
      const result = await addSerialsAction(productId, previous, formData);
      if (result.ok) {
        setOpen(false);
        setPasted("");
        setNote("");
        toast.success("Units added to stock");
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
          <Plus className="size-4" />
          Add Serials
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add serial numbers</DialogTitle>
          <DialogDescription>
            One per line. Each becomes a unit in stock, and the total is recorded
            as a stock adjustment.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="add-serials">Serial numbers</Label>
            <Textarea
              id="add-serials"
              name="serials"
              rows={6}
              autoFocus
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={"SN-0001\nSN-0002\nSN-0003"}
              className="font-mono text-[13px]"
            />
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {count} unit{count === 1 ? "" : "s"} will be added.
            </p>
          </div>

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
            <Button type="submit" disabled={pending || count === 0}>
              {pending ? "Saving…" : `Add ${count || ""} unit${count === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
