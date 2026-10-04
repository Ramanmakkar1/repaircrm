"use client";

import * as React from "react";

import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_META } from "@/components/tickets/ticket-meta";
import { Block, ChipButton, Field, IssueLines, MoreToggle, TextTile } from "./tiles";
import {
  AUTO,
  NEW,
  NONE,
  PROMISED_TILES,
  promisedLabel,
  withPromised,
  type CheckInContext,
  type CheckInState,
  type Issue,
} from "./flow";

/** Chips for a short list, a select for a long one. */
const MAX_CHIPS = 6;

/** A big price field has no use for the browser's tiny up/down arrows. */
const NO_SPINNER = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Step 4: details, all optional, each with a sensible default. The price,
 * when it is promised, how urgent, who gets it, a note. Everything else the
 * form has (inspection fee, terms, branch, checklist, warranty) is one tap
 * away under "More options".
 */
export function DetailsStep({
  state,
  ctx,
  setState,
  issues,
  slaHint,
}: {
  state: CheckInState;
  ctx: CheckInContext;
  setState: (change: (state: CheckInState) => CheckInState) => void;
  issues: Issue[];
  slaHint?: string;
}) {
  const [more, setMore] = React.useState(false);
  const set = (patch: Partial<CheckInState>) => setState((current) => ({ ...current, ...patch }));
  const warranties = state.customerId && state.customerId !== NEW ? (ctx.warrantiesByCustomer[state.customerId] ?? []) : [];
  const messages = (field: string) => issues.filter((issue) => issue.step === 3 && issue.field === field).map((issue) => issue.message);
  const when = promisedLabel(state.promised.local);
  // A refused inspection fee has to be seen: its box opens by itself rather than hiding the message.
  const moreOpen = more || messages("inspectionFee").length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Block title="Quoted price" hint="Leave empty if not quoted yet.">
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">$</span>
            <Input
              id="ci-price"
              aria-label="Quoted price in dollars"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={state.quotedPrice}
              onChange={(event) => set({ quotedPrice: event.target.value })}
              aria-invalid={messages("quotedPrice").length > 0 || undefined}
              className={cn("h-16 pl-10 text-2xl font-semibold tabular-nums", NO_SPINNER)}
            />
          </div>
          <IssueLines messages={messages("quotedPrice")} />
        </Block>

        <Block title="How urgent?" hint="Normal unless you say otherwise.">
          <div role="group" aria-label="Priority" className="grid grid-cols-3 gap-2">
            {(["NORMAL", "HIGH", "URGENT"] as const).map((priority) => (
              <TextTile key={priority} title={PRIORITY_META[priority].label} selected={state.priority === priority} onClick={() => set({ priority })} className="min-h-16 px-1 sm:text-base" />
            ))}
          </div>
        </Block>
      </div>

      <Block title="Pickup promised">
        <div role="group" aria-label="Pickup promised" className="grid grid-cols-3 gap-3">
          {PROMISED_TILES.map((tile) => (
            <TextTile key={tile.choice} title={tile.label} selected={state.promised.choice === tile.choice} onClick={() => setState((current) => withPromised(current, tile.choice))} />
          ))}
        </div>
        {state.promised.choice === "pick" ? (
          <Field label="Date and time" htmlFor="ci-promised">
            <Input
              id="ci-promised"
              type="datetime-local"
              value={state.promised.local}
              onChange={(event) => set({ promised: { choice: "pick", local: event.target.value } })}
              className="h-14 max-w-sm text-lg"
            />
          </Field>
        ) : null}
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {when ? <strong className="font-semibold text-foreground">Promised for {when}. </strong> : null}
          {slaHint ?? "Leave empty and the shop's usual time applies."} Times use this device&apos;s timezone.
        </p>
      </Block>

      {ctx.techs.length > 0 ? (
        <Block title="Assign to">
          {ctx.techs.length <= MAX_CHIPS ? (
            <div role="group" aria-label="Assign to" className="flex flex-wrap gap-2">
              <ChipButton selected={state.assignedToId === NONE} onClick={() => set({ assignedToId: NONE })}>Unassigned</ChipButton>
              {ctx.techs.map((tech) => (
                <ChipButton key={tech.value} selected={state.assignedToId === tech.value} onClick={() => set({ assignedToId: tech.value })}>{tech.label}</ChipButton>
              ))}
            </div>
          ) : (
            <Select value={state.assignedToId} onValueChange={(value) => set({ assignedToId: value })}>
              <SelectTrigger aria-label="Assign to" className="h-14 text-base"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {ctx.techs.map((tech) => <SelectItem key={tech.value} value={tech.value}>{tech.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Block>
      ) : null}

      <Block title="Notes" hint="What the customer reported, what you saw at the counter.">
        <Textarea
          id="ci-details-notes"
          aria-label="Notes"
          rows={2}
          value={state.notes}
          onChange={(event) => set({ notes: event.target.value })}
          placeholder="Optional"
        />
      </Block>

      <div className="flex flex-col gap-3">
        <MoreToggle open={moreOpen} onToggle={() => setMore((open) => !open)}>More options</MoreToggle>
        {moreOpen ? (
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inspection fee" htmlFor="ci-fee" hint="Charged up front as a line on the repair.">
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">$</span>
                  <Input
                    id="ci-fee"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={state.inspectionFee}
                    onChange={(event) => set({ inspectionFee: event.target.value })}
                    aria-invalid={messages("inspectionFee").length > 0 || undefined}
                    className={cn("h-14 pl-8 text-lg tabular-nums", NO_SPINNER)}
                  />
                </div>
                <IssueLines messages={messages("inspectionFee")} />
              </Field>
              <Field label="Low priority" htmlFor="ci-low" hint="For repairs that can wait.">
                <ChipButton id="ci-low" selected={state.priority === "LOW"} onClick={() => set({ priority: state.priority === "LOW" ? "NORMAL" : "LOW" })} className="h-14 w-full justify-center">
                  Mark as low priority
                </ChipButton>
              </Field>
            </div>

            <label className="flex min-h-12 items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={state.termsAccepted}
                onChange={(event) => set({ termsAccepted: event.target.checked })}
                className="size-6 shrink-0 accent-[var(--accent)]"
              />
              Customer accepted the shop&apos;s repair terms
            </label>

            {ctx.locations.length > 1 ? (
              <Field label="Location" htmlFor="ci-location">
                <Select value={state.locationId} onValueChange={(value) => set({ locationId: value })}>
                  <SelectTrigger id="ci-location" className="h-14 text-base"><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ctx.locations.map((location) => <SelectItem key={location.value} value={location.value}>{location.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {ctx.checklists.length > 0 ? (
              <Field label="Checklist" htmlFor="ci-checklist" hint="Automatic picks the checklist saved for this problem type.">
                <Select value={state.checklistTemplateId} onValueChange={(value) => set({ checklistTemplateId: value })}>
                  <SelectTrigger id="ci-checklist" className="h-14 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={AUTO}>Automatic</SelectItem>
                    <SelectItem value={NONE}>No checklist</SelectItem>
                    {ctx.checklists.map((checklist) => <SelectItem key={checklist.value} value={checklist.value}>{checklist.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {warranties.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="ci-warranty" className="text-[15px] font-semibold">Warranty claim</label>
                    <p className="text-[13px] text-muted-foreground">
                      This customer has {warranties.length} purchase{warranties.length === 1 ? "" : "s"} still under warranty.
                    </p>
                  </div>
                  <Switch
                    id="ci-warranty"
                    checked={state.isWarranty}
                    onCheckedChange={(next) => set({ isWarranty: next, warrantyLineId: next ? state.warrantyLineId : NONE })}
                  />
                </div>
                {state.isWarranty ? (
                  <Select value={state.warrantyLineId} onValueChange={(value) => set({ warrantyLineId: value })}>
                    <SelectTrigger aria-label="Warranted purchase" className="h-14 text-base"><SelectValue placeholder="Which purchase?" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>Not chosen yet</SelectItem>
                      {warranties.map((warranty) => (
                        <SelectItem key={warranty.value} value={warranty.value}>{warranty.label} · {warranty.hint}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
