"use client";

import * as React from "react";
import { Check, Lock, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
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
import { cn } from "@/components/ui/cn";
import type { PosCustomer } from "./types";

export function CustomerPicker({
  customers,
  customerId,
  onCustomerChange,
  disabled,
  ticketNumber,
}: {
  customers: PosCustomer[];
  customerId: string | null;
  onCustomerChange: (id: string | null) => void;
  disabled?: boolean;
  ticketNumber?: number | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const onOpenChange = (next: boolean) => {
    if (next) setQuery("");
    setOpen(next);
  };

  const selected = React.useMemo(
    () => (customerId ? customers.find((c) => c.id === customerId) ?? null : null),
    [customers, customerId],
  );

  const needle = query.trim().toLowerCase();
  const digitsOnlyNeedle = needle.replace(/\D/g, "");

  const visible = React.useMemo(() => {
    if (!needle) return customers;
    return customers.filter((c) => {
      if (c.label.toLowerCase().includes(needle)) return true;
      if (c.email && c.email.toLowerCase().includes(needle)) return true;
      if (c.phone) {
        if (c.phone.toLowerCase().includes(needle)) return true;
        if (digitsOnlyNeedle && c.phone.replace(/\D/g, "").includes(digitsOnlyNeedle)) {
          return true;
        }
      }
      return false;
    });
  }, [customers, needle, digitsOnlyNeedle]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* --------------------------------- Trigger / Current selection box */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "h-12 flex-1 justify-between px-3 text-left font-normal transition-colors",
                selected
                  ? "border-accent/40 bg-surface-hover/50 hover:bg-surface-hover"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Attach a customer"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {disabled ? (
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ICONS.customer className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-medium text-foreground">
                    {selected ? selected.label : "Walk-in (No customer)"}
                  </span>
                  {selected && (selected.creditBalanceCents > 0 || selected.taxExempt) ? (
                    <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      {selected.creditBalanceCents > 0 ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCents(selected.creditBalanceCents)} credit
                        </span>
                      ) : null}
                      {selected.creditBalanceCents > 0 && selected.taxExempt ? (
                        <span>·</span>
                      ) : null}
                      {selected.taxExempt ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          Tax exempt
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>

              {!disabled && (
                <span className="shrink-0 text-[12px] font-medium text-muted-foreground underline-offset-2 group-hover:underline">
                  {selected ? "Change" : "Attach"}
                </span>
              )}
            </Button>
          </DialogTrigger>

          {/* Quick-detach button when customer is attached and not locked */}
          {selected && !disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-12 shrink-0 text-muted-foreground hover:text-foreground"
              title="Detach customer (switch to Walk-in)"
              onClick={() => onCustomerChange(null)}
            >
              <X className="size-4" />
              <span className="sr-only">Switch to walk-in</span>
            </Button>
          ) : null}
        </div>

        {disabled && ticketNumber ? (
          <p className="text-[12px] leading-snug text-muted-foreground">
            The customer is set by ticket #{ticketNumber}. Remove the ticket to
            change it.
          </p>
        ) : null}
      </div>

      {/* --------------------------------- Customer search modal */}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach a customer</DialogTitle>
          <DialogDescription>
            Search by name, phone, or email to link this sale to a customer account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <ACTIONS.search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="h-12 pl-10 pr-9 text-[14px]"
              autoFocus
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
            {/* Quick option: Walk-in (no account) */}
            <button
              type="button"
              onClick={() => {
                onCustomerChange(null);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                !customerId ? "bg-accent/5 font-medium" : "",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-surface-hover text-muted-foreground">
                  <UserRound className="size-4" />
                </div>
                <div>
                  <span className="block text-[14px] text-foreground">
                    Walk-in Customer
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    Anonymous sale (no customer record)
                  </span>
                </div>
              </div>
              {!customerId ? (
                <Check className="size-4 text-accent shrink-0" />
              ) : null}
            </button>

            {/* Filtered list */}
            {visible.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                <p>No customers match &ldquo;{query}&rdquo;.</p>
                <p className="mt-1 text-xs text-faint-foreground">
                  Check the spelling or search by digits of the phone number.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((c) => {
                  const isCurrent = c.id === customerId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onCustomerChange(c.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                          isCurrent ? "bg-accent/5" : "",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-[14px] font-medium text-foreground">
                              {c.label}
                            </span>
                            {c.creditBalanceCents > 0 ? (
                              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCents(c.creditBalanceCents)} credit
                              </span>
                            ) : null}
                            {c.taxExempt ? (
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                                Tax exempt
                              </span>
                            ) : null}
                          </div>

                          {(c.phone || c.email) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
                              {c.phone ? <span>{c.phone}</span> : null}
                              {c.phone && c.email ? <span>·</span> : null}
                              {c.email ? (
                                <span className="truncate">{c.email}</span>
                              ) : null}
                            </div>
                          )}
                        </div>

                        {isCurrent ? (
                          <Check className="size-4 text-accent shrink-0" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              {visible.length} customer{visible.length === 1 ? "" : "s"} available
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
