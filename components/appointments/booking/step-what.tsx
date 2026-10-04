"use client";

import type { AppointmentFormValues } from "../appointment-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, IssueLines, MoreToggle } from "@/components/tickets/intake/tiles";
import { NONE } from "../dialog-meta";
import { NEW, VISIT_KINDS, hasCustomer, type BookingContext, type Issue, type VisitKind } from "./flow";
import { VisitTileButton } from "./tiles";

/**
 * Step 3: what the visit is for. Five boxes write the title for you; "Other"
 * asks for it in words. The title itself, the repair it belongs to, the
 * technician, the place and any notes are all still here, behind one "More
 * options".
 */
export function WhatStep({
  values,
  kind,
  ctx,
  setValues,
  change,
  onKind,
  more,
  onMore,
  issues,
}: {
  values: AppointmentFormValues;
  kind: VisitKind | "";
  ctx: BookingContext;
  setValues: (apply: (values: AppointmentFormValues) => AppointmentFormValues) => void;
  /** As setValues, and drops any "already booked" warning: a different tech is a different diary. */
  change: (apply: (values: AppointmentFormValues) => AppointmentFormValues) => void;
  onKind: (kind: VisitKind) => void;
  more: boolean;
  onMore: () => void;
  issues: Issue[];
}) {
  const messages = issues.filter((issue) => issue.step === 2).map((issue) => issue.message);
  const tickets =
    hasCustomer(values) && values.customerId !== NEW ? (ctx.ticketsByCustomer[values.customerId] ?? []) : [];

  const titleInput = (id: string, autoFocus: boolean) => (
    <Input
      id={id}
      value={values.title}
      onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
      maxLength={160}
      autoFocus={autoFocus}
      placeholder="Screen swap drop-off"
      className="h-14 text-lg"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <IssueLines messages={messages} />

      <div role="group" aria-label="What the visit is for" className="grid grid-cols-2 gap-2">
        {VISIT_KINDS.map((tile) => (
          <VisitTileButton
            key={tile.kind}
            tile={tile}
            selected={kind === tile.kind}
            onClick={() => onKind(tile.kind)}
            className={tile.kind === "other" ? "col-span-2" : undefined}
          />
        ))}
      </div>

      {kind === "other" ? (
        <Field label="What is it for?" htmlFor="bk-title-other">
          {titleInput("bk-title-other", true)}
        </Field>
      ) : null}

      <MoreToggle open={more} onToggle={onMore}>
        More options
      </MoreToggle>

      {more ? (
        <div className="flex flex-col gap-4">
          {kind !== "other" ? (
            <Field label="Title" htmlFor="bk-title" hint="Written for you from the box above. Change it if you like.">
              {titleInput("bk-title", false)}
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Technician" htmlFor="bk-tech" className={ctx.locations.length === 0 ? "sm:col-span-2" : undefined}>
              <Select
                value={values.assignedToId}
                onValueChange={(next) => change((current) => ({ ...current, assignedToId: next }))}
              >
                <SelectTrigger id="bk-tech" className="h-12 text-base">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {ctx.techs.map((tech) => (
                    <SelectItem key={tech.value} value={tech.value}>
                      {tech.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {ctx.locations.length > 0 ? (
              <Field label="Location" htmlFor="bk-location">
                <Select
                  value={values.locationId}
                  onValueChange={(next) => setValues((current) => ({ ...current, locationId: next }))}
                >
                  <SelectTrigger id="bk-location" className="h-12 text-base">
                    <SelectValue placeholder="No location" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>No location</SelectItem>
                    {ctx.locations.map((location) => (
                      <SelectItem key={location.value} value={location.value}>
                        {location.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field
              label="Linked repair"
              htmlFor="bk-ticket"
              className="sm:col-span-2"
              hint={
                !hasCustomer(values)
                  ? "Choose a customer to link one of their repairs."
                  : tickets.length === 0
                    ? "No repairs on file for them."
                    : undefined
              }
            >
              <Select
                value={values.ticketId}
                onValueChange={(next) => setValues((current) => ({ ...current, ticketId: next }))}
                disabled={!hasCustomer(values) || tickets.length === 0}
              >
                <SelectTrigger id="bk-ticket" className="h-12 text-base">
                  <SelectValue placeholder="No repair" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>No repair</SelectItem>
                  {tickets.map((ticket) => (
                    <SelectItem key={ticket.value} value={ticket.value}>
                      {ticket.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notes" htmlFor="bk-notes">
            <Textarea
              id="bk-notes"
              rows={3}
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              maxLength={2000}
              placeholder="Bringing the charger too. Parking round the back."
              className="text-base"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
