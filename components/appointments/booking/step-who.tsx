"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";

import type { AppointmentFormValues, CustomerOption } from "../appointment-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InitialsVisual } from "@/components/ui/record-card";
import { Field, IssueLines, MoreToggle } from "@/components/tickets/intake/tiles";
import { contactFromQuery } from "@/lib/customers/search-options";
import {
  NEW,
  customerName,
  findCustomers,
  hasCustomer,
  noMatchLine,
  searchPlaceholder,
  searchesByContact,
  withCustomer,
  withNewCustomer,
  withNewPerson,
  type BookingContext,
  type Issue,
} from "./flow";

const SHOWN = 8;
/** Customers shown to tap before anything is typed: two rows, so the step fits a tablet. */
const RECENT = 4;

function contactOf(customer: CustomerOption) {
  return customer.phone || customer.email || "";
}

/** A person as one large tap row: initials, name, number. */
function CustomerRow({ customer, onPick }: { customer: CustomerOption; onPick: () => void }) {
  const contact = contactOf(customer);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <InitialsVisual name={customer.label} className="size-12 text-lg" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg font-semibold leading-tight">{customer.label}</span>
        {contact ? <span className="truncate text-[15px] text-muted-foreground">{contact}</span> : null}
      </span>
    </button>
  );
}

/**
 * Step 1: who is coming in. One big search box (name or phone), the matches as
 * large rows, and a "New customer" box that asks for just a name or a number.
 * Nobody is a fine answer too: a walk-in slot needs no customer.
 */
export function WhoStep({
  values,
  ctx,
  setValues,
  onChosen,
  issues,
  focusSearch,
}: {
  values: AppointmentFormValues;
  ctx: Pick<BookingContext, "customers">;
  setValues: (change: (values: AppointmentFormValues) => AppointmentFormValues) => void;
  /** Somebody was tapped: on to the time. */
  onChosen: () => void;
  issues: Issue[];
  /** A keyboard is at hand, so the cursor goes straight to the search box. */
  focusSearch: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [email, setEmail] = React.useState(() => Boolean(values.newCustomerEmail));
  const typed = query.trim();
  const adding = values.customerId === NEW;
  const messages = issues.filter((issue) => issue.step === 0).map((issue) => issue.message);

  const matches = React.useMemo(() => findCustomers(ctx.customers, typed), [ctx.customers, typed]);

  const pick = (id: string) => {
    setValues((current) => withCustomer(current, id));
    setQuery("");
    onChosen();
  };
  const startNew = (from: string) => {
    setValues((current) => withNewCustomer(current, from));
    // An address typed into the search box lands in the email field, so show it.
    setEmail(Boolean(from.trim() && contactFromQuery(from).email));
  };
  const forget = () => {
    setValues((current) => withCustomer(current, ""));
    setQuery("");
  };

  if (adding) {
    const name = values.newCustomerName ?? "";
    const phone = values.newCustomerPhone ?? "";
    const hasPhone = phone.trim() !== "";
    return (
      <div className="flex flex-col gap-4">
        <IssueLines messages={messages} />
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">New customer</h3>
            <Button type="button" variant="ghost" className="h-12 px-4 text-[15px]" onClick={forget}>
              Search instead
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="bk-new-name">
              <Input
                id="bk-new-name"
                value={name}
                onChange={(event) => setValues((current) => withNewPerson(current, { name: event.target.value }))}
                placeholder="Full name"
                autoComplete="off"
                autoFocus
                maxLength={120}
                className="h-14 text-lg"
              />
            </Field>
            <Field label="Mobile number" htmlFor="bk-new-phone">
              <Input
                id="bk-new-phone"
                value={phone}
                onChange={(event) => setValues((current) => withNewPerson(current, { phone: event.target.value }))}
                placeholder="Mobile number"
                inputMode="tel"
                autoComplete="off"
                maxLength={40}
                className="h-14 text-lg"
              />
            </Field>
          </div>
          <p className="text-[13px] text-muted-foreground">A name or a phone number is enough. They&rsquo;re saved as a customer when you book.</p>
          {/* Asked out loud at the counter, recorded here. Texting someone who
              never agreed to it is what gets a shop's number blocked. */}
          <label className="flex min-h-12 items-start gap-3 text-[15px]">
            <input
              type="checkbox"
              checked={values.newCustomerSmsOk !== false && hasPhone}
              disabled={!hasPhone}
              onChange={(event) => setValues((current) => ({ ...current, newCustomerSmsOk: event.target.checked }))}
              className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
            />
            <span>
              They&rsquo;re happy to get texts about this booking and their repair
              <span className="block text-[13px] text-muted-foreground">
                {hasPhone
                  ? "They get a confirmation text now and a reminder before the visit."
                  : "Add a mobile number to text them."}
              </span>
            </span>
          </label>
          <MoreToggle open={email} onToggle={() => setEmail((open) => !open)}>
            Email (optional)
          </MoreToggle>
          {email ? (
            <Field label="Email" htmlFor="bk-new-email" hint="Leave blank if unknown or the customer prefers not to share.">
              <Input
                id="bk-new-email"
                type="email"
                inputMode="email"
                value={values.newCustomerEmail ?? ""}
                onChange={(event) => setValues((current) => withNewPerson(current, { email: event.target.value }))}
                placeholder="name@example.com"
                autoComplete="off"
                maxLength={200}
                className="h-14 text-lg"
              />
            </Field>
          ) : null}
        </div>
      </div>
    );
  }

  if (hasCustomer(values)) {
    const label = customerName(values, ctx);
    const known = ctx.customers.find((customer) => customer.value === values.customerId);
    const contact = known ? contactOf(known) : "";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-2xl border border-accent bg-surface p-4 ring-1 ring-accent">
          <InitialsVisual name={label} className="size-14 text-xl" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xl font-semibold">{label}</span>
            {contact ? <span className="truncate text-[15px] text-muted-foreground">{contact}</span> : null}
          </div>
          <Button type="button" variant="outline" className="h-12 px-5 text-[15px]" onClick={forget}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={messages} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
        <Input
          id="bk-search"
          aria-label={searchesByContact(ctx.customers) ? "Search customers by name or phone" : "Search customers by name"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the top match; with no match it starts a new customer from what was typed.
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !typed) return;
            event.preventDefault();
            if (matches[0]) pick(matches[0].value);
            else startNew(typed);
          }}
          placeholder={searchPlaceholder(ctx.customers)}
          autoComplete="off"
          autoFocus={focusSearch}
          className="h-16 pl-12 text-lg"
        />
      </div>

      {typed ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          {matches.slice(0, SHOWN).map((customer) => (
            <CustomerRow key={customer.value} customer={customer} onPick={() => pick(customer.value)} />
          ))}
          {matches.length === 0 ? (
            <p className="px-1 text-base text-muted-foreground">{noMatchLine(ctx.customers, typed)}</p>
          ) : null}
          {matches.length > SHOWN ? (
            <p className="px-1 text-sm text-muted-foreground">{matches.length - SHOWN} more match. Keep typing to narrow it down.</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => startNew(typed)}
        className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <UserPlus className="size-6" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-semibold leading-tight">
            {typed && matches.length === 0 ? <>New customer: {typed}</> : "New customer"}
          </span>
          <span className="text-[15px] text-muted-foreground">Just a name or a phone number</span>
        </span>
      </button>

      {!typed && ctx.customers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-semibold text-muted-foreground">Or tap a customer</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.customers.slice(0, RECENT).map((customer) => (
              <CustomerRow key={customer.value} customer={customer} onPick={() => pick(customer.value)} />
            ))}
          </div>
          {ctx.customers.length > RECENT ? (
            <p className="px-1 text-sm text-muted-foreground">Start typing to find anyone else.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
