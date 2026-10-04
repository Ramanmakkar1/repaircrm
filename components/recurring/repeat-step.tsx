"use client";

import * as React from "react";
import { CalendarClock, CalendarDays, CalendarRange, Check, Repeat } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/cn";
import { IssueLines } from "@/components/tickets/intake/tiles";
import {
  customerOf,
  payWithinLabel,
  repeatName,
  repeatSentence,
  type BillContext,
  type BillState,
  type Copy,
  type Issue,
  type RepeatDetails,
} from "@/components/billing/bill/flow";
import { FREQUENCIES, type Frequency } from "./meta";

/**
 * The last step of a repeat bill: "How often?".
 *
 * One sentence says the whole schedule back ("Bills Okonkwo Dental Group
 * $450.00 every month, from Oct 18, 2026."), then the choices as big tiles
 * and toggles: how often, the first (or next) bill day, how long they have to
 * pay, and whether to email or charge each bill unattended. Everything here is
 * controlled by the builder's state and posted by it as the very fields the
 * old schedule form posted.
 */

const FREQUENCY_TILES: Record<Frequency, { title: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }> = {
  WEEKLY: { title: "Every week", icon: CalendarDays },
  MONTHLY: { title: "Every month", icon: CalendarClock },
  QUARTERLY: { title: "Every 3 months", icon: CalendarRange },
  YEARLY: { title: "Every year", icon: Repeat },
};

const PAY_WITHIN = [0, 7, 14, 30] as const;

export function RepeatStep({
  state,
  ctx,
  copy,
  editing,
  onDate,
  onRepeat,
  issues,
  phonePanel,
}: {
  state: BillState;
  ctx: BillContext;
  copy: Copy;
  editing: boolean;
  onDate: (value: string) => void;
  onRepeat: (patch: Partial<RepeatDetails>) => void;
  issues: Issue[];
  /** The panel for a phone, which has no side column. */
  phonePanel: React.ReactNode;
}) {
  const id = React.useId();
  const repeat = state.repeat;
  const hasCard = Boolean(customerOf(state, ctx)?.hasCard);

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={issues.map((issue) => issue.message)} />

      <p role="status" className="rounded-2xl border border-border bg-surface-hover px-4 py-4 text-lg font-semibold leading-snug text-foreground">
        {repeatSentence(state, ctx)}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">How often?</legend>
        <div role="radiogroup" aria-label="How often" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FREQUENCIES.map((value) => {
            const tile = FREQUENCY_TILES[value];
            const Icon = tile.icon;
            const checked = repeat.frequency === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onRepeat({ frequency: value })}
                className={cn(
                  "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[15px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-6",
                  checked
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border-strong bg-surface text-foreground hover:bg-surface-hover",
                )}
              >
                <Icon aria-hidden />
                {tile.title}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-date`} className="text-base font-semibold">{copy.dateLabel}</Label>
        <Input
          id={`${id}-date`}
          type="date"
          value={state.date}
          onChange={(event) => onDate(event.target.value)}
          className="h-14 text-lg"
        />
        <p className="text-[14px] text-muted-foreground">{copy.dateHint}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-semibold">How long do they have to pay?</legend>
        <div role="radiogroup" aria-label="How long to pay" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_WITHIN.map((days) => {
            const checked = repeat.dueInDays === days;
            return (
              <button
                key={days}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onRepeat({ dueInDays: days })}
                className={cn(
                  "min-h-12 rounded-xl border px-2 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  checked
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border-strong bg-surface text-foreground hover:bg-surface-hover",
                )}
              >
                {days === 0 ? "On receipt" : `${days} days`}
              </button>
            );
          })}
        </div>
        {!PAY_WITHIN.includes(repeat.dueInDays as (typeof PAY_WITHIN)[number]) ? (
          <p className="text-[14px] text-muted-foreground">Now: {payWithinLabel(repeat.dueInDays)}.</p>
        ) : null}
      </fieldset>

      <div className="lg:hidden">{phonePanel}</div>

      <section aria-label="Do it for me" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h3 className="text-base font-semibold">Do it for me</h3>
        <ToggleTile
          checked={repeat.autoSend}
          onChange={(next) => onRepeat({ autoSend: next })}
          title="Email each bill to them"
          detail="Each bill is emailed as soon as it is made. Off: it waits for you to send it."
        />
        <ToggleTile
          checked={repeat.autoCharge && hasCard}
          onChange={(next) => onRepeat({ autoCharge: next })}
          disabled={!hasCard}
          title="Charge their card"
          detail={
            hasCard
              ? "Each bill is taken from the card on file. If the card is declined, you get an email."
              : "No card saved for this customer. Save one on their page to turn this on."
          }
        />
        {editing ? (
          <ToggleTile
            checked={repeat.active}
            onChange={(next) => onRepeat({ active: next })}
            title={repeat.active ? "Billing is on" : "Billing is paused"}
            detail={repeat.active ? "Bills are made on their day." : "No bills are made until you turn this back on."}
          />
        ) : null}
      </section>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`} className="text-base font-semibold">Name in your list (optional)</Label>
        <Input
          id={`${id}-name`}
          value={repeat.name}
          onChange={(event) => onRepeat({ name: event.target.value })}
          maxLength={120}
          placeholder={repeatName({ ...state, repeat: { ...repeat, name: "" } }, ctx)}
          className="h-12 text-base"
        />
        <p className="text-[14px] text-muted-foreground">Only you see this. The customer sees the items.</p>
      </div>

      <p className="px-1 text-[15px] text-muted-foreground">{copy.saveNote}</p>
    </div>
  );
}

/** A big on/off row: the word says the state, never only the switch's colour. */
function ToggleTile({
  checked,
  onChange,
  title,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <span className="text-[14px] leading-snug text-muted-foreground">{detail}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "flex h-9 min-w-16 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[14px] font-bold",
          checked ? "bg-accent text-accent-foreground" : "bg-surface-hover text-muted-foreground",
        )}
      >
        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}
