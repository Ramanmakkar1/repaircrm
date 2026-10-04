"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { createTicketAction } from "@/app/(app)/tickets/actions";
import { EMPTY_STATE } from "../action-state";
import { CustomerStep } from "./step-customer";
import { DetailsStep } from "./step-details";
import { DeviceStep } from "./step-device";
import { ProblemStep } from "./step-problem";
import { Stepper } from "./stepper";
import { MobileBar, SummaryPanel } from "./summary";
import {
  LAST_STEP,
  STEPS,
  advanceDevice,
  fieldValues,
  initialState,
  initialStep,
  stepForServerError,
  stepMessage,
  stepStatus,
  submitBlocker,
  summaryLine,
  summaryRows,
  validate,
  type AssetOption,
  type CheckInContext,
  type CheckInState,
  type Option,
  type WarrantyOption,
} from "./flow";
import type { SearchCustomer } from "@/lib/customers/search-options";
import { DEFAULT_DEVICE_KINDS, type DeviceKind, type SaveIntakeOptions } from "@/lib/intake-options";

export type EasyCheckInProps = {
  customers: SearchCustomer[];
  assetsByCustomer: Record<string, AssetOption[]>;
  techs: Option[];
  problemTypes: string[];
  defaultCustomerId?: string;
  locations?: Option[];
  defaultLocationId?: string;
  checklists?: Option[];
  warrantiesByCustomer?: Record<string, WarrantyOption[]>;
  slaHint?: string;
  /** The shop's device boxes (Settings, Workflow). The standard list when left out. */
  deviceKinds?: readonly DeviceKind[];
  /** A picture chosen for a problem, by the problem's name. */
  problemPictures?: Record<string, string>;
  /**
   * The owner only: the one action that saves the device and problem boxes. Its presence
   * switches on "Add this to my devices" and the "Add more devices / problems" links.
   */
  saveOptions?: SaveIntakeOptions;
};

/**
 * The Easy-mode check-in: choices on the left, a live "This repair" on the
 * right, like the Sell screen.
 *
 * Every choice lives in one CheckInState and reaches the server as hidden
 * inputs (see fieldValues), so the form posts exactly what createTicketAction
 * has always read, whichever step happens to be on screen. The inputs you type
 * into have no name of their own; the hidden ones carry the value.
 */
export function EasyCheckIn({
  customers,
  assetsByCustomer,
  techs,
  problemTypes,
  defaultCustomerId,
  locations = [],
  defaultLocationId,
  checklists = [],
  warrantiesByCustomer = {},
  slaHint,
  deviceKinds = DEFAULT_DEVICE_KINDS,
  problemPictures,
  saveOptions,
}: EasyCheckInProps) {
  const [server, formAction, pending] = useActionState(createTicketAction, EMPTY_STATE);
  // "Add this to my devices" changes the list without leaving the check-in; the page's own copy follows on its next load.
  const [addedKinds, setAddedKinds] = React.useState<readonly DeviceKind[] | null>(null);
  const kinds = addedKinds ?? deviceKinds;
  const ctx = React.useMemo<CheckInContext>(
    () => ({ customers, assetsByCustomer, warrantiesByCustomer, techs, problemTypes, locations, checklists, deviceKinds: kinds, problemPictures }),
    [customers, assetsByCustomer, warrantiesByCustomer, techs, problemTypes, locations, checklists, kinds, problemPictures],
  );

  const [state, setState] = React.useState<CheckInState>(() => initialState({ customerId: defaultCustomerId, locationId: defaultLocationId }));
  const [step, setStep] = React.useState(() => initialStep(defaultCustomerId));
  /** The steps something was refused on: their messages stay up until each is fixed. A step nobody has tried to leave yet is not scolded. */
  const [attempted, setAttempted] = React.useState<number[]>([]);
  /** Counts refusals (a Next or a Check in that was stopped), so each one brings its message into view. */
  const [refusals, setRefusals] = React.useState(0);
  const refuse = (steps: number[]) => {
    setAttempted((current) => [...new Set([...current, ...steps])]);
    setRefusals((count) => count + 1);
  };

  // A refusal from the server lands on the step that can fix it.
  const [seen, setSeen] = React.useState(server);
  if (server !== seen) {
    setSeen(server);
    if (server?.error) {
      setStep(stepForServerError(server.error));
      setRefusals((count) => count + 1);
    }
  }

  const blocker = submitBlocker(state, ctx);
  const issues = validate(state, ctx).filter((issue) => attempted.includes(issue.step));
  const values = fieldValues(state, ctx);
  const statuses = STEPS.map((_, index) => stepStatus(state, ctx, index));

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const stepperRef = React.useRef<HTMLDivElement>(null);
  const leftRef = React.useRef<HTMLDivElement>(null);
  const firstRender = React.useRef(true);
  const shownRefusals = React.useRef(0);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Step 1 puts the cursor in its search box itself.
    if (step !== 0) headingRef.current?.focus({ preventScroll: true });
    // A refusal brings its message into view (it is under the heading, but the page may be
    // scrolled to the bottom of the tiles); an ordinary step change shows the top of the step.
    const refused = refusals !== shownRefusals.current;
    shownRefusals.current = refusals;
    // The step's own message first; a refusal from the server (above the heading) when there is none.
    const message = refused ? (leftRef.current?.querySelector("section [data-issues]") ?? leftRef.current?.querySelector("[data-issues]")) : null;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (message ?? stepperRef.current)?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [step, refusals]);

  const goTo = (next: number) => setStep(Math.max(0, Math.min(LAST_STEP, next)));
  const advance = () => goTo(step + 1);

  /** The Next button, here and on the phone's bar. A required choice that is missing stops it with its message. */
  function goNext() {
    if (step === 1) {
      const next = advanceDevice(state);
      setState(next.state);
      if (next.leave) goTo(2);
      return;
    }
    const missing = validate(state, ctx).some((issue) => issue.step === step && (step === 0 || step === 2));
    if (missing) {
      refuse([step]);
      return;
    }
    advance();
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const found = validate(state, ctx);
    const first = found[0];
    if (pending || first) {
      event.preventDefault();
      if (first) {
        // Everything in the way is shown on its own step, the first one right now.
        refuse(found.map((issue) => issue.step));
        goTo(first.step);
      }
    }
  }

  // A scanner, a keyboard or a stray Enter must never check a repair in. In a field marked
  // data-enter="next" (the name, the model, ...) it means Next instead.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (event.target.dataset.enter === "next") goNext();
  }

  const reason = blocker?.message ?? null;
  const rows = summaryRows(state, ctx);

  return (
    <form action={formAction} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} onReset={(event) => event.preventDefault()} className="flex flex-col gap-5">
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <div ref={leftRef} className="flex min-w-0 flex-col gap-5">
          <div ref={stepperRef}>
            <Stepper step={step} statuses={statuses} onStep={goTo} />
          </div>

          {server?.error ? (
            <div role="alert" data-issues="" className="flex scroll-mt-28 scroll-mb-44 items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{server.error}</span>
            </div>
          ) : null}

          <section aria-labelledby="ci-heading" className="flex flex-col gap-5">
            <div>
              <h2 id="ci-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                {STEPS[step].title}
              </h2>
              <p className="text-base text-muted-foreground">{STEPS[step].hint}</p>
            </div>

            {step === 0 ? <CustomerStep state={state} ctx={ctx} setState={setState} onChosen={() => goTo(1)} onNext={goNext} issues={issues} /> : null}
            {step === 1 ? (
              <DeviceStep state={state} ctx={ctx} setState={setState} onAdvance={() => goTo(2)} onNext={goNext} issues={issues} saveOptions={saveOptions} onKindsChanged={setAddedKinds} />
            ) : null}
            {step === 2 ? <ProblemStep state={state} ctx={ctx} setState={setState} onChosen={() => goTo(3)} onNext={goNext} issues={issues} canEditOptions={Boolean(saveOptions)} /> : null}
            {step === 3 ? <DetailsStep state={state} ctx={ctx} setState={setState} issues={issues} slaHint={slaHint} /> : null}
          </section>

          {/* On a phone the summary is not beside the choices, so the last step shows it above the bar. */}
          {step === LAST_STEP ? (
            <div className="lg:hidden">
              <SummaryPanel rows={rows} onChange={goTo} reason={reason} pending={pending} showActions={false} />
            </div>
          ) : null}
        </div>

        <aside aria-label="This repair" className="hidden lg:sticky lg:top-2 lg:block">
          <SummaryPanel rows={rows} onChange={goTo} reason={reason} pending={pending} />
        </aside>
      </div>

      <MobileBar step={step} line={summaryLine(state, ctx)} reason={reason} warning={stepMessage(issues, step)} pending={pending} onNext={goNext} />
    </form>
  );
}
