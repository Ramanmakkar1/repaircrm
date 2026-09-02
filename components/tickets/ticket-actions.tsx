"use client";

import * as React from "react";
import { useActionState } from "react";
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteTicketAction,
  makeInvoiceAction,
  updateTicketAction,
} from "@/app/(app)/tickets/actions";
import { EMPTY_STATE, type ActionState } from "./action-state";
import type { Option } from "./ticket-form";
import { PRIORITIES, PRIORITY_META } from "./ticket-meta";

// ---------------------------------------------------------------------------

export type TicketEditValues = {
  subject: string;
  problemType: string;
  priority: string;
  assignedToId: string | null;
  assetId: string | null;
  /** Pre-formatted yyyy-MM-dd so the date input doesn't re-parse a timestamp. */
  dueDate: string;
  diagnosticNotes: string;
};

export function EditTicketDialog({
  ticketId,
  values,
  problemTypes,
  techs,
  assets,
}: {
  ticketId: string;
  values: TicketEditValues;
  problemTypes: string[];
  techs: Option[];
  assets: Option[];
}) {
  const [open, setOpen] = React.useState(false);

  // Closing on success is part of the submit, not an effect watching `state`.
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await updateTicketAction(ticketId, previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Ticket updated");
      }
      return result;
    },
    EMPTY_STATE,
  );

  // The shop may have retired a problem type after this ticket was written —
  // keep the current value selectable so saving can't silently change it.
  const problemOptions = problemTypes.includes(values.problemType)
    ? problemTypes
    : [values.problemType, ...problemTypes];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit ticket</DialogTitle>
          <DialogDescription>
            Status changes belong in the update composer, so they always carry a note.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          {state.error ? (
            <p role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-subject">Subject</Label>
            <Input
              id="edit-subject"
              name="subject"
              required
              defaultValue={values.subject}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-problem">Problem type</Label>
              <Select name="problemType" defaultValue={values.problemType}>
                <SelectTrigger id="edit-problem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {problemOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select name="priority" defaultValue={values.priority}>
                <SelectTrigger id="edit-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tech">Assigned to</Label>
              <Select
                name="assignedToId"
                defaultValue={values.assignedToId ?? "none"}
              >
                <SelectTrigger id="edit-tech">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {techs.map((tech) => (
                    <SelectItem key={tech.value} value={tech.value}>
                      {tech.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-due">Due date</Label>
              <Input
                id="edit-due"
                name="dueDate"
                type="date"
                defaultValue={values.dueDate}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-asset">Device</Label>
            <Select name="assetId" defaultValue={values.assetId ?? "none"}>
              <SelectTrigger id="edit-asset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="none">No device</SelectItem>
                {assets.map((asset) => (
                  <SelectItem key={asset.value} value={asset.value}>
                    {asset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-notes">Diagnostic notes</Label>
            <Textarea
              id="edit-notes"
              name="diagnosticNotes"
              rows={4}
              defaultValue={values.diagnosticNotes}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/** OWNER-only, and behind a confirm — deleting takes the charges and time with it. */
export function DeleteTicketDialog({
  ticketId,
  ticketNumber,
}: {
  ticketId: string;
  ticketNumber: number;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete ticket">
          <Trash2 className="size-4 text-faint-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete ticket #{ticketNumber}?</DialogTitle>
          <DialogDescription>
            This permanently removes the ticket along with its notes, charges and
            logged time. Invoices already created from it are kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <form action={deleteTicketAction.bind(null, ticketId)}>
            <Button type="submit" variant="destructive" size="sm">
              Delete ticket
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * Ticket → invoice, behind a confirm.
 *
 * The confirm exists for one reason: the time checkbox. Billing the clock is a
 * decision (some of that hour was the tech learning the board, some of it was
 * the customer talking), and it is a decision that has to be made BEFORE the
 * invoice exists, because after that the entries are stamped and read-only.
 *
 * On success the action redirects to the new invoice, so the only thing to
 * surface here is the "nothing to invoice" case.
 */
export function MakeInvoiceButton({
  ticketId,
  chargeCount,
  unbilledTimeCount,
  unbilledTimeLabel,
  unbilledTimeValue,
}: {
  ticketId: string;
  chargeCount: number;
  /** Stopped, billable, not-yet-billed entries. */
  unbilledTimeCount: number;
  /** Those entries as h:mm, already rounded to the shop's increment. */
  unbilledTimeLabel: string;
  /** …and what they are worth, formatted. */
  unbilledTimeValue: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [includeTime, setIncludeTime] = React.useState(true);

  const [, formAction, pending] = useActionState(
    async (): Promise<ActionState> => {
      const result = await makeInvoiceAction(ticketId, { includeTime });
      if (result.error) toast.error(result.error);
      return result;
    },
    EMPTY_STATE,
  );

  const nothingToBill = chargeCount === 0 && unbilledTimeCount === 0;
  const billable = chargeCount + (includeTime ? unbilledTimeCount : 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={nothingToBill}>
          <Receipt className="size-4" />
          {nothingToBill ? "Make Invoice" : `Make Invoice (${chargeCount + unbilledTimeCount})`}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create an invoice</DialogTitle>
          <DialogDescription>
            Everything picked here is stamped onto the new invoice and becomes
            read-only on the ticket.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Un-invoiced charges</span>
            <span className="font-semibold tabular-nums text-foreground">
              {chargeCount}
            </span>
          </li>
        </ul>

        {unbilledTimeCount > 0 ? (
          <label className="flex items-start gap-2.5 rounded-md border border-border bg-surface-hover/60 p-3.5">
            <Checkbox
              className="mt-0.5"
              checked={includeTime}
              onCheckedChange={(next) => setIncludeTime(next === true)}
              aria-label="Bill the logged time"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-foreground">
                Bill {unbilledTimeCount} time{" "}
                {unbilledTimeCount === 1 ? "entry" : "entries"}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {unbilledTimeLabel} of labour · {unbilledTimeValue}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No unbilled time on this ticket.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <form action={formAction}>
            <Button type="submit" size="sm" disabled={pending || billable === 0}>
              {pending ? "Creating…" : "Create invoice"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
