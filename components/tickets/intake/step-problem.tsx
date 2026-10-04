"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, IconTile, IssueLines, MoreToggle, NextButton, OwnerLink, PhotoTile } from "./tiles";
import { PROBLEM_ICONS } from "./visuals";
import {
  deviceTypeOf,
  effectiveSubject,
  isOtherProblem,
  problemOptions,
  problemVisualFor,
  withProblem,
  type CheckInContext,
  type CheckInState,
  type Issue,
} from "./flow";

/**
 * Step 3: what's wrong. A box per problem (the ones common for this kind of
 * device, then the shop's own list, then Other). Tapping one writes the repair
 * title for you and moves on; the title and a note stay editable below.
 */
export function ProblemStep({
  state,
  ctx,
  setState,
  onChosen,
  onNext,
  issues,
  canEditOptions = false,
}: {
  state: CheckInState;
  ctx: CheckInContext;
  setState: (change: (state: CheckInState) => CheckInState) => void;
  /** A problem was tapped: on to the details. */
  onChosen: () => void;
  onNext: () => void;
  issues: Issue[];
  /** The owner: shows the quiet "Add more problems" link to Settings. */
  canEditOptions?: boolean;
}) {
  const [noteOpen, setNoteOpen] = React.useState(false);
  const type = deviceTypeOf(state, ctx);
  const options = React.useMemo(() => problemOptions(type, ctx.problemTypes), [type, ctx.problemTypes]);
  const other = isOtherProblem(state.problemType);
  const messages = issues.filter((issue) => issue.step === 2).map((issue) => issue.message);

  return (
    <div className="flex flex-col gap-5">
      <IssueLines messages={messages} />
      <div role="group" aria-label="Problems" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {options.map((label) => {
          const visual = problemVisualFor(label, ctx.problemPictures);
          const selected = state.problemType === label;
          const choose = () => {
            setState((current) => withProblem(current, label));
            // "Other" asks what it is first; every other box is the answer.
            if (!isOtherProblem(label)) onChosen();
          };
          return visual.kind === "photo" ? (
            <PhotoTile key={label} photo={visual.src} title={isOtherProblem(label) ? "Other" : label} selected={selected} onClick={choose} />
          ) : (
            <IconTile key={label} icon={PROBLEM_ICONS[visual.icon]} title={isOtherProblem(label) ? "Other" : label} selected={selected} onClick={choose} />
          );
        })}
      </div>

      {other ? (
        <Field label="What is the problem?" htmlFor="ci-other" hint="A few words. It becomes the repair title.">
          <Input
            id="ci-other"
            data-enter="next"
            value={state.otherText}
            onChange={(event) => setState((current) => ({ ...current, otherText: event.target.value, subject: null }))}
            maxLength={120}
            autoComplete="off"
            autoFocus
            className="h-14 text-lg"
          />
        </Field>
      ) : null}

      <div className="flex flex-col gap-3">
        <MoreToggle open={noteOpen} onToggle={() => setNoteOpen((open) => !open)}>Add a note or change the title</MoreToggle>
        {noteOpen ? (
          <div className="flex flex-col gap-4">
            <Field label="Repair title" htmlFor="ci-subject" hint="Filled in from the device and the problem. Change it to add specifics.">
              <div className="flex gap-2">
                <Input
                  id="ci-subject"
                  value={effectiveSubject(state, ctx)}
                  onChange={(event) => setState((current) => ({ ...current, subject: event.target.value }))}
                  maxLength={200}
                  placeholder="iPhone 14 Pro: cracked screen, touch dead on left edge"
                  className="h-14 text-lg"
                />
                {state.subject !== null && state.problemType ? (
                  <Button type="button" variant="outline" className="h-14 shrink-0 px-4" onClick={() => setState((current) => ({ ...current, subject: null }))}>
                    Reset
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field label="Notes" htmlFor="ci-notes" hint="What the customer reported, what you saw at the counter.">
              <Textarea
                id="ci-notes"
                rows={4}
                value={state.notes}
                onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional"
              />
            </Field>
          </div>
        ) : null}
      </div>

      {canEditOptions ? <OwnerLink href="/settings?tab=workflow">Add more problems</OwnerLink> : null}

      {state.problemType ? <NextButton onClick={onNext}>Next: Details</NextButton> : null}
    </div>
  );
}
