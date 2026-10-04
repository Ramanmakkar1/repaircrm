"use client";

import * as React from "react";
import { format } from "date-fns";

import type { AppointmentFormValues } from "../appointment-state";
import { Input } from "@/components/ui/input";
import { Block, Field, IssueLines } from "@/components/tickets/intake/tiles";
import { shortTime } from "../calendar-meta";
import {
  LONGER_DURATIONS,
  QUICK_DURATIONS,
  endOf,
  isLongerDuration,
  quickDays,
  timeSlots,
  withDuration,
  type Issue,
} from "./flow";
import { ChoiceChip, DayTile, SlotTile } from "./tiles";

const SLOTS = timeSlots();

/**
 * Step 2: when. A day (Today / Tomorrow / Next week, or any date), a time (one
 * box per hour of the calendar's day, or any time at all) and how long. On a
 * tablet the day and the length sit beside the times, so the whole step is
 * visible at once.
 */
export function WhenStep({
  values,
  change,
  now,
  issues,
}: {
  values: AppointmentFormValues;
  /** Applies the change and drops any "already booked" warning: a new time is a new question. */
  change: (apply: (values: AppointmentFormValues) => AppointmentFormValues) => void;
  now: Date;
  issues: Issue[];
}) {
  const messages = issues.filter((issue) => issue.step === 1).map((issue) => issue.message);
  const days = React.useMemo(() => quickDays(now), [now]);
  const [longer, setLonger] = React.useState(() => isLongerDuration(values.duration));
  const end = endOf(values);
  const showLonger = longer || isLongerDuration(values.duration);

  return (
    <div className="flex flex-col gap-5">
      <IssueLines messages={messages} />
      {/* One column on a phone: Day, Start time, How long. Two on a tablet: Day over How long, beside the times. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Block title="Day" className="min-w-0 sm:col-start-1 sm:row-start-1">
          <div className="grid grid-cols-3 gap-2">
            {days.map((day) => (
              <DayTile
                key={day.key}
                title={day.label}
                detail={day.detail}
                selected={values.startDate === day.date}
                onClick={() => change((current) => ({ ...current, startDate: day.date }))}
              />
            ))}
          </div>
          <Field label="Or pick a date" htmlFor="bk-date" hint={dayName(values.startDate)}>
            <Input
              id="bk-date"
              type="date"
              value={values.startDate}
              onChange={(event) => change((current) => ({ ...current, startDate: event.target.value }))}
              className="h-14 text-lg sm:h-12"
            />
          </Field>
        </Block>

        <Block title="Start time" className="min-w-0 sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <div className="grid grid-cols-4 gap-2">
            {SLOTS.map((slot) => (
              <SlotTile
                key={slot.value}
                label={slot.label}
                selected={values.startTime === slot.value}
                onClick={() => change((current) => ({ ...current, startTime: slot.value }))}
              />
            ))}
          </div>
          <Field label="Or any other time" htmlFor="bk-time">
            <Input
              id="bk-time"
              type="time"
              step={300}
              value={values.startTime}
              onChange={(event) => change((current) => ({ ...current, startTime: event.target.value }))}
              className="h-14 text-lg sm:h-12"
            />
          </Field>
        </Block>

        <section className="flex min-w-0 flex-col gap-3 sm:col-start-1 sm:row-start-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">How long</h3>
            {end ? <p className="text-sm text-muted-foreground">Ends at {shortTime(end)}</p> : null}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_DURATIONS.map((chip) => (
              <ChoiceChip
                key={chip.value}
                selected={values.duration === chip.value}
                onClick={() => change((current) => withDuration(current, chip.value))}
              >
                {chip.label}
              </ChoiceChip>
            ))}
            <ChoiceChip selected={showLonger} onClick={() => setLonger((open) => !open)}>
              Longer
            </ChoiceChip>
          </div>
          {showLonger ? (
            <div className="grid grid-cols-3 gap-2">
              {LONGER_DURATIONS.map((chip) => (
                <ChoiceChip
                  key={chip.value}
                  selected={values.duration === chip.value}
                  onClick={() => change((current) => withDuration(current, chip.value))}
                >
                  {chip.label}
                </ChoiceChip>
              ))}
            </div>
          ) : null}
          {values.duration === "custom" ? (
            <Field label="Ends at" htmlFor="bk-end">
              <Input
                id="bk-end"
                type="time"
                step={300}
                value={values.endTime}
                onChange={(event) => change((current) => ({ ...current, endTime: event.target.value }))}
                className="h-14 text-lg sm:h-12"
              />
            </Field>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** "Friday, October 10": the day the chosen date falls on, so a date picked blind is checked at a glance. */
function dayName(date: string): string | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts) return undefined;
  return format(new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])), "EEEE, MMMM d");
}
