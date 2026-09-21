"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Check, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { saveAppointmentAction } from "@/app/(app)/appointments/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AppointmentConflict, Option } from "./appointment-state";
import { DURATION_OPTIONS } from "./calendar-meta";

const NONE = "none";
/** `customerId` while booking someone who is not a customer yet. */
const NEW = "new";

export type AppointmentPickers = {
  customers: Option[];
  /** Only the tickets belonging to each customer — one query at page load. */
  ticketsByCustomer: Record<string, Option[]>;
  techs: Option[];
  locations: Option[];
};

export type AppointmentFormValues = {
  id: string | null;
  title: string;
  customerId: string;
  /** Filled when `customerId` is "new" — a first-time caller booked from here. */
  newCustomerName?: string;
  newCustomerPhone?: string;
  newCustomerEmail?: string;
  /** Undefined reads as yes: the box starts ticked, and unticking is the act. */
  newCustomerSmsOk?: boolean;
  ticketId: string;
  assignedToId: string;
  locationId: string;
  /** Pre-formatted yyyy-MM-dd / HH:mm so the inputs never re-parse a timestamp. */
  startDate: string;
  startTime: string;
  duration: string;
  endTime: string;
  notes: string;
  /**
   * "Sep 1, 9:14 AM" when the reminder has already gone out, null otherwise.
   * Pre-formatted on the server so the dialog never reaches for its own clock.
   */
  reminderSentLabel?: string | null;
};

/**
 * Create / edit an appointment.
 *
 * Two things here are deliberate:
 *
 *  · Duration, not an end time. Nobody books "10:00 to 11:30" in their head;
 *    they book "an hour and a half at ten". "Custom end time" is still there
 *    for the job that runs to a hard stop.
 *  · An overlap is a WARNING. The action refuses once and says what it would
 *    collide with; "Book anyway" sends it again with the override. Shops
 *    double-book on purpose — a 10-minute pickup during a bench job is normal —
 *    so blocking it outright would just teach staff to keep the diary elsewhere.
 */
export function AppointmentDialog({
  open,
  onOpenChange,
  values: initial,
  pickers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: AppointmentFormValues;
  pickers: AppointmentPickers;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<AppointmentFormValues>(initial);
  const [conflict, setConflict] = React.useState<AppointmentConflict | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const isEdit = Boolean(initial.id);

  const set = React.useCallback(
    <K extends keyof AppointmentFormValues>(
      key: K,
      value: AppointmentFormValues[K],
    ) => setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const tickets =
    values.customerId && values.customerId !== NONE
      ? (pickers.ticketsByCustomer[values.customerId] ?? [])
      : [];

  async function save(confirmOverlap: boolean) {
    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("customerId", values.customerId || NONE);
    formData.set("newCustomerName", values.newCustomerName ?? "");
    formData.set("newCustomerPhone", values.newCustomerPhone ?? "");
    formData.set("newCustomerEmail", values.newCustomerEmail ?? "");
    if (values.newCustomerSmsOk !== false) formData.set("newCustomerSmsOk", "on");
    formData.set("ticketId", values.ticketId);
    formData.set("assignedToId", values.assignedToId);
    formData.set("locationId", values.locationId);
    formData.set("startDate", values.startDate);
    formData.set("startTime", values.startTime);
    formData.set("duration", values.duration);
    formData.set("endTime", values.endTime);
    formData.set("notes", values.notes);
    if (confirmOverlap) formData.set("confirmOverlap", "on");

    setBusy(true);
    const result = await saveAppointmentAction(initial.id, formData);
    setBusy(false);

    if (!result.ok) {
      if (result.conflict) {
        setConflict(result.conflict);
        setError(null);
        return;
      }
      setConflict(null);
      setError(result.error);
      return;
    }

    toast.success(isEdit ? "Appointment updated." : "Appointment booked.");
    onOpenChange(false);
    onSaved?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appointment" : "New appointment"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Move it, reassign it, or write down what changed."
              : "Drop-off, pickup, callback or an on-site job — anything that needs a slot."}
          </DialogDescription>
        </DialogHeader>

        {/* Moving a booking the customer has already been reminded about is
            worth knowing before you press save, so it sits at the top. */}
        {initial.reminderSentLabel ? (
          <p className="flex items-center gap-2 rounded-md bg-status-resolved-bg px-3.5 py-2.5 text-[13px] font-medium text-status-resolved-fg">
            <Check className="size-4 shrink-0" />
            Reminder sent {initial.reminderSentLabel}
          </p>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
          className="flex flex-col gap-5"
        >
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive-soft px-3.5 py-2.5 text-sm font-medium text-destructive"
            >
              {error}
            </p>
          ) : null}

          {conflict ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-status-in-progress/40 bg-status-in-progress-bg px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-status-in-progress-fg">
                <AlertTriangle className="size-4 shrink-0" />
                {conflict.techName} is already booked
              </span>
              <span className="text-[13.5px] leading-snug text-status-in-progress-fg">
                <strong className="font-semibold">{conflict.title}</strong>
                {conflict.customerName ? ` · ${conflict.customerName}` : ""}
                <br />
                {conflict.when}
              </span>
              <span className="text-[13px] text-status-in-progress-fg/80">
                Book it anyway if that&rsquo;s intentional, or change the time or
                the tech.
              </span>
            </div>
          ) : null}

          <Field label="Title" htmlFor="title" required>
            <Input
              id="title"
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              maxLength={160}
              autoFocus
              required
              placeholder="Screen swap drop-off"
            />
          </Field>

          <Field
            label="Customer"
            hint={
              values.customerId === NEW
                ? "They're saved as a customer when you book — no need to add them first."
                : "Optional — a walk-in slot doesn't need one. New caller? Type their name."
            }
          >
            <CustomerPicker
              customers={pickers.customers}
              value={values.customerId}
              newName={values.newCustomerName ?? ""}
              newPhone={values.newCustomerPhone ?? ""}
              newEmail={values.newCustomerEmail ?? ""}
              smsOk={values.newCustomerSmsOk !== false}
              onSmsOkChange={(ok) => setValues((prev) => ({ ...prev, newCustomerSmsOk: ok }))}
              onNewChange={(person) =>
                setValues((prev) => ({
                  ...prev,
                  newCustomerName: person.name,
                  newCustomerPhone: person.phone,
                  newCustomerEmail: person.email,
                }))
              }
              onChange={(next, name) =>
                setValues((prev) => ({
                  ...prev,
                  customerId: next,
                  newCustomerName: next === NEW ? (name ?? "") : "",
                  newCustomerPhone: next === NEW ? (prev.newCustomerPhone ?? "") : "",
                  newCustomerEmail: next === NEW ? (prev.newCustomerEmail ?? "") : "",
                  // The previous ticket belongs to the previous customer.
                  ticketId: NONE,
                }))
              }
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Ticket"
              htmlFor="ticketId"
              hint={
                values.customerId && tickets.length === 0
                  ? "No tickets on file for them."
                  : undefined
              }
            >
              <Select
                value={values.ticketId}
                onValueChange={(next) => set("ticketId", next)}
                disabled={!values.customerId || tickets.length === 0}
              >
                <SelectTrigger id="ticketId">
                  <SelectValue placeholder="No ticket" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>No ticket</SelectItem>
                  {tickets.map((ticket) => (
                    <SelectItem key={ticket.value} value={ticket.value}>
                      {ticket.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tech" htmlFor="assignedToId">
              <Select
                value={values.assignedToId}
                onValueChange={(next) => {
                  set("assignedToId", next);
                  // A different tech means a different diary — re-check it.
                  setConflict(null);
                }}
              >
                <SelectTrigger id="assignedToId">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {pickers.techs.map((tech) => (
                    <SelectItem key={tech.value} value={tech.value}>
                      {tech.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" htmlFor="startDate" required>
              <Input
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(event) => {
                  set("startDate", event.target.value);
                  setConflict(null);
                }}
                required
              />
            </Field>

            <Field label="Start time" htmlFor="startTime" required>
              <Input
                id="startTime"
                type="time"
                step={300}
                value={values.startTime}
                onChange={(event) => {
                  set("startTime", event.target.value);
                  setConflict(null);
                }}
                required
              />
            </Field>

            <Field label="Duration" htmlFor="duration">
              <Select
                value={values.duration}
                onValueChange={(next) => {
                  set("duration", next);
                  setConflict(null);
                }}
              >
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {values.duration === "custom" ? (
              <Field label="End time" htmlFor="endTime" required>
                <Input
                  id="endTime"
                  type="time"
                  step={300}
                  value={values.endTime}
                  onChange={(event) => {
                    set("endTime", event.target.value);
                    setConflict(null);
                  }}
                  required
                />
              </Field>
            ) : (
              <Field label="Location" htmlFor="locationId">
                <LocationSelect
                  locations={pickers.locations}
                  value={values.locationId}
                  onChange={(next) => set("locationId", next)}
                />
              </Field>
            )}
          </div>

          {values.duration === "custom" ? (
            <Field label="Location" htmlFor="locationIdCustom">
              <LocationSelect
                id="locationIdCustom"
                locations={pickers.locations}
                value={values.locationId}
                onChange={(next) => set("locationId", next)}
              />
            </Field>
          ) : null}

          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              maxLength={2000}
              placeholder="Bringing the charger too. Parking round the back."
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            {conflict ? (
              <Button type="button" disabled={busy} onClick={() => void save(true)}>
                <Check />
                {busy ? "Booking…" : "Book anyway"}
              </Button>
            ) : (
              <Button type="submit" disabled={busy}>
                <CalendarPlus />
                {busy ? "Saving…" : isEdit ? "Save changes" : "Book it"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function LocationSelect({
  id,
  locations,
  value,
  onChange,
}: {
  id?: string;
  locations: Option[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id ?? "locationId"}>
        <SelectValue placeholder="No location" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>No location</SelectItem>
        {locations.map((location) => (
          <SelectItem key={location.value} value={location.value}>
            {location.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A type-to-filter customer picker.
 *
 * Not a `<Select>`: Radix's own typeahead only jumps to a prefix match, which
 * is useless for finding "Marquez" by typing "marq" in a list of hundreds. This
 * is an inline filter over a scrolling list instead — no portal, so it behaves
 * inside a dialog, and no new dependency.
 */
function CustomerPicker({
  customers,
  value,
  newName,
  newPhone,
  newEmail,
  smsOk,
  onSmsOkChange,
  onChange,
  onNewChange,
}: {
  customers: Option[];
  value: string;
  newName: string;
  newPhone: string;
  newEmail: string;
  smsOk: boolean;
  onSmsOkChange: (ok: boolean) => void;
  /** `name` rides along when switching to a new customer, to seed the form. */
  onChange: (next: string, name?: string) => void;
  onNewChange: (person: { name: string; phone: string; email: string }) => void;
}) {
  const [query, setQuery] = React.useState("");
  const selected = customers.find((customer) => customer.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? customers.filter((customer) => customer.label.toLowerCase().includes(needle))
      : customers;
    // The list is only ever a scroll box — 40 rows is plenty to pick from, and
    // anything past that is a search term away.
    return list.slice(0, 40);
  }, [customers, query]);

  // A first-time caller: two fields, right here. The person on the phone is
  // mid-sentence — sending the front desk to another screen to "create the
  // customer first" is how bookings get scribbled on paper instead.
  if (value === NEW) {
    const person = { name: newName, phone: newPhone, email: newEmail };
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface-hover p-3.5">
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
            value={newName}
            onChange={(event) => onNewChange({ ...person, name: event.target.value })}
            placeholder="Full name"
            aria-label="New customer's name"
            autoComplete="off"
            autoFocus
          />
          <Input
            value={newPhone}
            onChange={(event) => onNewChange({ ...person, phone: event.target.value })}
            placeholder="Mobile number"
            aria-label="New customer's mobile number"
            inputMode="tel"
            autoComplete="off"
          />
          <Input
            value={newEmail}
            onChange={(event) => onNewChange({ ...person, email: event.target.value })}
            placeholder="Email (optional)"
            aria-label="New customer's email (optional)"
            type="email"
            inputMode="email"
            autoComplete="off"
            className="sm:col-span-2"
          />
        </div>
        {/* Asked out loud at the counter, recorded here. Texting someone who
            never agreed to it is what gets a shop's number blocked. */}
        <label className="flex items-start gap-2.5 text-[13.5px] text-foreground">
          <input
            type="checkbox"
            checked={smsOk && newPhone.trim() !== ""}
            disabled={newPhone.trim() === ""}
            onChange={(event) => onSmsOkChange(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            They&rsquo;re happy to get texts about this booking and their repair
            <span className="block text-[12.5px] text-muted-foreground">
              {newPhone.trim() === ""
                ? "Add a mobile number to text them."
                : "They get a confirmation text now and a reminder before the visit."}
            </span>
          </span>
        </label>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3.5 text-sm">
        <span className="truncate font-medium text-foreground">{selected.label}</span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-faint-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Clear customer"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customers…"
          className="pl-10"
        />
      </div>

      {query.trim() ? (
        <div className="max-h-44 overflow-y-auto rounded-md border border-border">
          {filtered.length === 0 ? (
            <p className="px-3.5 py-3 text-[13.5px] text-muted-foreground">
              Nobody on file matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((customer) => (
                <li key={customer.value}>
                  <button
                    type="button"
                    onClick={() => onChange(customer.value)}
                    className={cn(
                      "w-full px-3.5 py-2.5 text-left text-[13.5px] text-foreground transition-colors",
                      "hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                    )}
                  >
                    {customer.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onChange(NEW, query.trim())}
            className={cn(
              "flex w-full items-center gap-2 border-t border-border px-3.5 py-3 text-left text-[13.5px] font-semibold text-foreground transition-colors",
              "hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
            )}
          >
            <UserPlus className="size-4 shrink-0" />
            <span className="truncate">Book &ldquo;{query.trim()}&rdquo; as a new customer</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
