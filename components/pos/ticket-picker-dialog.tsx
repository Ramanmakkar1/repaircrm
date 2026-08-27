"use client";

import * as React from "react";
import { Search, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import type { PosTicket } from "./types";

/**
 * "Add from ticket" — pull a finished repair onto the register.
 *
 * Only tickets that are still open AND have work nobody has invoiced yet ever
 * appear: an already-billed ticket has nothing to sell, and offering it would
 * be an invitation to charge the customer twice.
 *
 * SINGLE-TICKET RULE. One sale bills at most one ticket, because `Invoice`
 * carries a single `ticketId` — two repairs in one transaction would leave one
 * of them unlinked and unfindable from the invoice. The trigger disables itself
 * once a ticket is on the cart; a second repair is a second sale.
 */
export function TicketPickerDialog({
  tickets,
  attachedTicketId,
  onPick,
  disabled,
}: {
  tickets: PosTicket[];
  attachedTicketId: string | null;
  onPick: (ticket: PosTicket) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const onOpenChange = (next: boolean) => {
    if (next) setQuery("");
    setOpen(next);
  };

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? tickets.filter(
        (ticket) =>
          String(ticket.number).includes(needle.replace(/^#/, "")) ||
          ticket.customerLabel.toLowerCase().includes(needle) ||
          ticket.subject.toLowerCase().includes(needle),
      )
    : tickets;

  const blocked = attachedTicketId !== null;
  const empty = tickets.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-12 w-full justify-start"
          disabled={disabled || blocked || empty}
          title={
            blocked
              ? "One sale bills one ticket — ring this one up first."
              : empty
                ? "No open tickets have un-invoiced work right now."
                : undefined
          }
        >
          <Wrench />
          Add from ticket
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bill a repair ticket</DialogTitle>
          <DialogDescription>
            Open tickets with work that has not been invoiced yet. Picking one
            pulls its charges onto this sale and attaches its customer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticket #, customer or subject…"
              className="h-12 pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border">
            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {tickets.length === 0
                  ? "Nothing is waiting to be billed."
                  : "No open ticket matches that."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(ticket);
                        setOpen(false);
                      }}
                      className="flex w-full items-start justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[15px] font-bold tabular-nums text-foreground">
                            #{ticket.number}
                          </span>
                          <span className="truncate text-[14px] font-semibold text-foreground">
                            {ticket.customerLabel}
                          </span>
                        </span>
                        <span className="line-clamp-1 text-[13px] text-muted-foreground">
                          {ticket.subject}
                        </span>
                        <span className="text-[12.5px] font-medium text-faint-foreground">
                          {ticket.charges.length} un-invoiced charge
                          {ticket.charges.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                        {formatCents(ticket.subtotalCents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[12.5px] leading-snug text-muted-foreground">
            Ticket charges are billed at the price quoted on the bench and are
            not editable here. Change them on the ticket if they are wrong.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
