"use client";

import * as React from "react";
import { Check, Building2, FileText, Mail, MapPin, MessageSquareText, Percent, type LucideIcon } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Section } from "@/lib/customers/form-sections";

/**
 * The small pieces of the Easy-mode customer quick add: a big labelled field,
 * the tiles that switch the optional sections on, the "Text updates" row, and
 * the card an open section shows its fields in.
 */

/** Inputs here are 56px tall on a phone, 64px from a tablet, with 20px text. `!` because Easy mode pins every input to 16px. */
export const BIG_INPUT = "h-14 rounded-xl px-4 text-xl! sm:h-16";
/** The optional sections' inputs: still big, a step quieter. */
export const FIELD_INPUT = "h-14 rounded-xl text-[17px]!";

export const SECTION_TILES: {
  section: Section;
  icon: LucideIcon;
  /** The tile's name and the heading of the card that opens. */
  title: string;
  heading: string;
}[] = [
  { section: "email", icon: Mail, title: "Add email", heading: "Email" },
  { section: "address", icon: MapPin, title: "Add address", heading: "Address" },
  { section: "business", icon: Building2, title: "Business", heading: "Business" },
  { section: "notes", icon: FileText, title: "Notes", heading: "Notes" },
  { section: "tax", icon: Percent, title: "Tax", heading: "Tax settings" },
];

/** A label above one input, an error under it in words. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  big = false,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** The two main boxes get a bigger label. */
  big?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className={big ? "text-lg" : "text-base"}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[15px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * One box that switches an optional section on or off. A real button with
 * aria-pressed; when on it is filled in AND says "Added" (a word and a tick, not
 * only a colour). On a phone it is a compact row of icon and name; from the
 * tablet width up the five sit in one row, icon above name.
 */
export function SectionTile({
  icon: Icon,
  title,
  open,
  onToggle,
  className,
}: {
  icon: LucideIcon;
  title: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onToggle}
      className={cn(
        "flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border bg-surface p-2.5 text-left transition-[border-color,transform] duration-150",
        "sm:min-h-28 sm:flex-col sm:justify-start sm:gap-2 sm:px-2 sm:py-3 sm:text-center",
        "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11",
          open ? "bg-accent text-accent-foreground" : "bg-surface-hover text-foreground",
        )}
      >
        <Icon className="size-5 sm:size-6" strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-col sm:items-center">
        <span className="text-[15px] font-semibold leading-tight sm:text-base">{title}</span>
        {open ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-snug">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
            Added
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The card an open section shows its fields in. */
export function SectionCard({
  icon: Icon,
  heading,
  children,
}: {
  icon: LucideIcon;
  heading: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 id={id} className="flex items-center gap-2.5 text-lg font-semibold">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-lg bg-surface-hover">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
        {heading}
      </h3>
      {children}
    </section>
  );
}

/** The word under the number: "Text updates: On", with the switch to change it. */
export function TextUpdatesRow({
  on,
  hasNumber,
  onChange,
}: {
  on: boolean;
  hasNumber: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = React.useId();
  const hint = on
    ? hasNumber
      ? "We text this number when the device is ready."
      : "Add a mobile number so we can text them."
    : hasNumber
      ? "No texts. Tap to turn on."
      : "Turns on when you add a mobile number.";
  return (
    <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-4 rounded-xl bg-surface-hover px-4 py-3">
      <MessageSquareText aria-hidden className="size-6 shrink-0" strokeWidth={1.8} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold">
          Text updates:{" "}
          <span
            className={cn(
              "ml-0.5 inline-block rounded-md px-2 py-0.5 text-[15px]",
              on ? "bg-accent text-accent-foreground" : "border border-border-strong bg-surface text-foreground",
            )}
          >
            {on ? "On" : "Off"}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch id={id} checked={on} onCheckedChange={onChange} className="scale-125" />
    </label>
  );
}

/** A switch with its label, for the yes/no choices inside an open section. */
export function InlineSwitch({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <Label htmlFor={name} className="text-base font-normal">{label}</Label>
      <Switch id={name} name={name} checked={checked} onCheckedChange={onChange} className="scale-125" />
    </div>
  );
}
