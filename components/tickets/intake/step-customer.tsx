"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InitialsVisual } from "@/components/ui/record-card";
import { contactFromQuery, matchesCustomer, type SearchCustomer } from "@/lib/customers/search-options";
import { Field, IssueLines, MoreToggle, NextButton } from "./tiles";
import { NEW, customerOf, withCustomer, type CheckInContext, type CheckInState, type Issue } from "./flow";

const SHOWN = 8;
/** Customers shown to tap before anything is typed. */
const RECENT = 6;

function phoneOf(customer: SearchCustomer) {
  return customer.mobile || customer.phone || customer.email || "";
}

/** A person as one large tap row: initials, name, number. */
function CustomerRow({ customer, onPick }: { customer: SearchCustomer; onPick: () => void }) {
  const phone = phoneOf(customer);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <InitialsVisual name={customer.label} className="size-12 text-lg sm:size-14 sm:text-xl" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg font-semibold leading-tight">{customer.label}</span>
        {phone ? <span className="truncate text-[15px] text-muted-foreground">{phone}</span> : null}
      </span>
    </button>
  );
}

/**
 * Step 1: who is this for. One big search box (name or phone), the matches as
 * large rows, and a "New customer" box that asks for just a name or a number.
 */
export function CustomerStep({
  state,
  ctx,
  setState,
  onChosen,
  onNext,
  issues,
}: {
  state: CheckInState;
  ctx: CheckInContext;
  setState: (change: (state: CheckInState) => CheckInState) => void;
  /** A customer was tapped: on to the device. */
  onChosen: () => void;
  onNext: () => void;
  issues: Issue[];
}) {
  const [query, setQuery] = React.useState("");
  const [more, setMore] = React.useState(false);
  const selected = customerOf(state, ctx);
  const adding = state.customerId === NEW;
  const typed = query.trim();

  const matches = React.useMemo(() => (typed ? ctx.customers.filter((customer) => matchesCustomer(customer, typed)) : []), [ctx.customers, typed]);

  const pick = (id: string) => {
    setState((current) => withCustomer(current, id));
    setQuery("");
    onChosen();
  };
  const startNew = (fromQuery: string) => {
    const contact = fromQuery ? contactFromQuery(fromQuery) : { name: "", phone: "", email: "" };
    setState((current) => ({
      ...withCustomer(current, NEW),
      newCustomer: { ...current.newCustomer, ...contact },
    }));
    setMore(Boolean(contact.email));
  };
  const person = state.newCustomer;
  const setPerson = (patch: Partial<CheckInState["newCustomer"]>) =>
    setState((current) => ({ ...current, newCustomer: { ...current.newCustomer, ...patch } }));

  const messages = issues.filter((issue) => issue.step === 0).map((issue) => issue.message);

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-2xl border border-accent bg-surface p-4 ring-1 ring-accent">
          <InitialsVisual name={selected.label} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xl font-semibold">{selected.label}</span>
            {phoneOf(selected) ? <span className="truncate text-[15px] text-muted-foreground">{phoneOf(selected)}</span> : null}
          </div>
          <Button type="button" variant="outline" className="h-12 px-5 text-[15px]" onClick={() => setState((current) => withCustomer(current, ""))}>
            Change
          </Button>
        </div>
        <NextButton onClick={onNext}>Next: Device</NextButton>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-4">
        <IssueLines messages={messages} />
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">New customer</h3>
            <Button type="button" variant="ghost" className="h-12 px-4 text-[15px]" onClick={() => setState((current) => withCustomer(current, ""))}>
              Search instead
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="ci-new-name">
              <Input
                id="ci-new-name"
                data-enter="next"
                value={person.name}
                onChange={(event) => setPerson({ name: event.target.value })}
                placeholder="Full name"
                autoComplete="off"
                autoFocus
                maxLength={160}
                className="h-14 text-lg"
              />
            </Field>
            <Field label="Mobile number" htmlFor="ci-new-phone">
              <Input
                id="ci-new-phone"
                data-enter="next"
                value={person.phone}
                onChange={(event) => setPerson({ phone: event.target.value })}
                placeholder="Mobile number"
                inputMode="tel"
                autoComplete="off"
                maxLength={40}
                className="h-14 text-lg"
              />
            </Field>
          </div>
          <p className="text-[13px] text-muted-foreground">A name or a phone number is enough.</p>
          <MoreToggle open={more} onToggle={() => setMore((open) => !open)}>Email and text messages</MoreToggle>
          {more ? (
            <div className="flex flex-col gap-3">
              <Field label="Email (optional)" htmlFor="ci-new-email" hint="Leave blank if unknown or the customer prefers not to share.">
                <Input
                  id="ci-new-email"
                  type="email"
                  inputMode="email"
                  value={person.email}
                  onChange={(event) => setPerson({ email: event.target.value })}
                  placeholder="name@example.com"
                  autoComplete="off"
                  maxLength={160}
                  className="h-14 text-lg"
                />
              </Field>
              <label className="flex min-h-12 items-start gap-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={person.smsOk && person.phone.trim() !== ""}
                  disabled={person.phone.trim() === ""}
                  onChange={(event) => setPerson({ smsOk: event.target.checked })}
                  className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
                />
                <span>
                  Happy to get texts from the shop
                  <span className="block text-[13px] text-muted-foreground">
                    {person.phone.trim() === "" ? "Add a mobile number to text them." : "Receipts and updates can go by text."}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </div>
        <NextButton onClick={onNext}>Next: Device</NextButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={messages} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
        <Input
          id="ci-search"
          aria-label="Search customers by name or phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter takes the top match; with no match it starts a new customer from what was typed.
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !typed) return;
            event.preventDefault();
            if (matches[0]) pick(matches[0].id);
            else startNew(typed);
          }}
          placeholder="Name or phone number"
          autoComplete="off"
          autoFocus
          className="h-16 pl-12 text-lg"
        />
      </div>

      {typed ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          {matches.slice(0, SHOWN).map((customer) => (
            <CustomerRow key={customer.id} customer={customer} onPick={() => pick(customer.id)} />
          ))}
          {matches.length === 0 ? (
            <p className="px-1 text-base text-muted-foreground">Nobody on file matches &ldquo;{typed}&rdquo;.</p>
          ) : null}
          {matches.length > SHOWN ? (
            <p className="px-1 text-sm text-muted-foreground">{matches.length - SHOWN} more match. Keep typing to narrow it down.</p>
          ) : null}
        </div>
      ) : ctx.customers.length === 0 ? (
        <p className="px-1 text-base text-muted-foreground">Start typing a name or a phone number.</p>
      ) : null}

      <button
        type="button"
        onClick={() => startNew(typed)}
        className="flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground sm:size-14">
          <UserPlus className="size-6" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-semibold leading-tight">{typed && matches.length === 0 ? <>New customer: {typed}</> : "New customer"}</span>
          <span className="text-[15px] text-muted-foreground">Just a name or a phone number</span>
        </span>
      </button>

      {!typed && ctx.customers.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-semibold text-muted-foreground">Or tap a customer</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.customers.slice(0, RECENT).map((customer) => (
              <CustomerRow key={customer.id} customer={customer} onPick={() => pick(customer.id)} />
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
