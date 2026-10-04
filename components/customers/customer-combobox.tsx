"use client";

import * as React from "react";
import { Search, UserPlus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { contactFromQuery, matchesCustomer, newCustomerContactMessage, type SearchCustomer } from "@/lib/customers/search-options";

export type ComboCustomer = SearchCustomer;

/** Matches lib/customers/quick-add.ts — kept literal so this file stays client-safe. */
const NEW = "new";

/**
 * Pick a customer by typing, or add a new one right here.
 *
 * Replaces a plain dropdown that listed EVERY customer with no search — fine
 * for the demo's eight, hopeless for a shop with two thousand. Posts
 * `customerId` (an id, or "new" with the `newCustomer*` fields) as ordinary
 * form fields, so any server action can read it with
 * `readQuickCustomer` / `findOrCreateQuickCustomer`.
 */
export function CustomerCombobox({
  customers,
  value,
  onChange,
  allowNew = true,
  invalid = false,
  newValue = NEW,
  id,
}: {
  customers: ComboCustomer[];
  value: string;
  onChange: (id: string) => void;
  allowNew?: boolean;
  invalid?: boolean;
  newValue?: string;
  id?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [person, setPerson] = React.useState({ name: "", phone: "", email: "", smsOk: true });
  const selected = customers.find((customer) => customer.id === value) ?? null;

  const matches = React.useMemo(() => {
    return customers.filter((customer) => matchesCustomer(customer, query)).slice(0, 30);
  }, [customers, query]);

  // Not `required` on the name: a phone number alone is enough. Native validity
  // is what useGuidedForm's checkValidity() reads, so the rule has to live here.
  const nameRef = React.useRef<HTMLInputElement>(null);
  const adding = value === newValue;
  React.useEffect(() => {
    nameRef.current?.setCustomValidity(newCustomerContactMessage(person.name, person.phone));
  }, [adding, person.name, person.phone]);

  if (adding) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface-hover p-3.5">
        <input type="hidden" name="customerId" value={newValue} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-foreground">New customer</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="text-[13px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Search instead
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            ref={nameRef}
            name="newCustomerName"
            value={person.name}
            onChange={(event) => setPerson({ ...person, name: event.target.value })}
            placeholder="Full name"
            aria-label="New customer's name"
            autoComplete="off"
            autoFocus
            maxLength={160}
          />
          <Input
            name="newCustomerPhone"
            value={person.phone}
            onChange={(event) => setPerson({ ...person, phone: event.target.value })}
            placeholder="Mobile number"
            aria-label="New customer's mobile number"
            inputMode="tel"
            autoComplete="off"
            maxLength={40}
          />
          <details open={person.email.trim() ? true : undefined} className="sm:col-span-2">
          <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">Add email · optional</summary>
          <Input
            name="newCustomerEmail"
            value={person.email}
            onChange={(event) => setPerson({ ...person, email: event.target.value })}
            placeholder="Email (optional)"
            aria-label="New customer's email (optional)"
            type="email"
            inputMode="email"
            autoComplete="off"
            className="sm:col-span-2"
            maxLength={160}
          />
          <p className="mt-2 text-xs text-muted-foreground">Leave blank if unknown or the customer prefers not to share.</p>
          </details>
        </div>
        <label className="flex items-start gap-2.5 text-[13.5px] text-foreground">
          <input
            type="checkbox"
            name="newCustomerSmsOk"
            checked={person.smsOk && person.phone.trim() !== ""}
            disabled={person.phone.trim() === ""}
            onChange={(event) => setPerson({ ...person, smsOk: event.target.checked })}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            Happy to get texts from the shop
            <span className="block text-[12.5px] text-muted-foreground">
              {person.phone.trim() === "" ? "Add a mobile number to text them." : "Receipts and updates can go by text."}
            </span>
          </span>
        </label>
        <p className="text-[12.5px] text-muted-foreground">
          Saved with this repair or document. Search first to reuse someone already on file.
        </p>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3.5 text-sm">
        <input type="hidden" name="customerId" value={selected.id} />
        <span className="min-w-0"><span className="block truncate font-medium text-foreground">{selected.label}</span>{selected.mobile || selected.phone || selected.email ? <span className="block truncate text-xs text-muted-foreground">{selected.mobile || selected.phone || selected.email}</span> : null}</span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="flex size-12 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Change customer"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const typed = query.trim();
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="customerId" value="" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
        <Input
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, mobile, or email…"
          aria-label="Customer"
          aria-invalid={invalid || undefined}
          className="pl-10"
          autoComplete="off"
        />
      </div>
      {typed ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface">
          {matches.length > 0 ? (
            <ul className="divide-y divide-border">
              {matches.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => onChange(customer.id)}
                    className="w-full px-3.5 py-2.5 text-left text-[14px] text-foreground transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                  >
                    <span className="block font-medium">{customer.label}</span>
                    {customer.mobile || customer.phone || customer.email ? <span className="block text-xs text-muted-foreground">{customer.mobile || customer.phone || customer.email}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-3 text-[13.5px] text-muted-foreground">Nobody on file matches &ldquo;{typed}&rdquo;.</p>
          )}
          {allowNew ? (
            <button
              type="button"
              onClick={() => {
                setPerson((current) => ({ ...current, ...contactFromQuery(typed) }));
                onChange(newValue);
              }}
              className={cn(
                "flex w-full items-center gap-2 border-t border-border px-3.5 py-3 text-left text-[14px] font-semibold text-foreground transition-colors",
                "hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
              )}
            >
              <UserPlus className="size-4 shrink-0" />
              <span className="truncate">New customer using &ldquo;{typed}&rdquo;</span>
            </button>
          ) : null}
        </div>
      ) : allowNew ? <button type="button" onClick={() => onChange(newValue)} className="flex min-h-12 items-center gap-2 text-left text-sm font-semibold text-foreground underline underline-offset-2"><UserPlus className="size-4" /> Add a new customer</button> : null}
    </div>
  );
}
