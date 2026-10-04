"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Check } from "lucide-react";
import { toast } from "sonner";

import { saveAppointmentAction } from "@/app/(app)/appointments/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  appointmentFormData,
  type AppointmentConflict,
  type AppointmentFormValues,
  type AppointmentPickers,
} from "../appointment-state";
import { DEFAULT_DURATION, startsWithMoreDetails } from "../dialog-meta";
import {
  LAST_STEP,
  STEPS,
  blocker,
  hasCustomer,
  initialStep,
  kindOfTitle,
  normalizeDuration,
  primaryAction,
  stepDone,
  stepFocus,
  stepForServerError,
  summaryParts,
  validate,
  whoHint,
  withKind,
  type VisitKind,
} from "./flow";
import { WhoStep } from "./step-who";
import { WhenStep } from "./step-when";
import { WhatStep } from "./step-what";
import { Stepper } from "./stepper";
import { SummaryStrip } from "./summary";
import { useKeyboardBox } from "./viewport";

/**
 * A tablet gets a centred dialog of a steady height, so the button never jumps
 * between steps. A phone gets a full-height sheet that follows the visual
 * viewport (--bk-top / --bk-h are set while a keyboard is up), so the pinned
 * button stays above the keyboard. The `!` ones beat the phone sheet rules in
 * globals.css, which are plain (unlayered) CSS and would otherwise win.
 */
export const SHEET = cn(
  "flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(92dvh,46rem)]",
  "max-sm:h-[var(--bk-h,100dvh)] max-sm:w-full max-sm:top-[var(--bk-top,0px)]! max-sm:bottom-auto! max-sm:max-h-none! max-sm:overflow-hidden! max-sm:rounded-none! max-sm:pb-0!",
);

/**
 * Easy mode's "Book a visit" (and "Edit visit"): a dialog on a tablet, a
 * full-height sheet on a phone.
 *
 * Who -> When -> What for, one step on screen at a time, a live Who - When -
 * What strip and ONE big black button underneath that says what comes next and,
 * once there is enough, "Book visit" (or "Save changes" when editing).
 *
 * The request is the one the dense dialog has always sent: same fields, same
 * values, same server action, same "already booked" warning with its "Book
 * anyway" second try. Nothing here decides what is saved.
 */
export function BookingDialog({
  open,
  onOpenChange,
  values,
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
  const box = useKeyboardBox(open);
  const isEdit = Boolean(values.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Focus goes to the step's own first field, or its heading (see BookingFlow), not to whatever button comes first.
        onOpenAutoFocus={(event) => event.preventDefault()}
        style={
          box
            ? ({ "--bk-top": `${box.top}px`, "--bk-h": `${box.height}px` } as React.CSSProperties)
            : undefined
        }
        className={SHEET}
      >
        <DialogHeader className="shrink-0 gap-0.5 px-4 pb-3 pr-16 pt-4 sm:px-6 sm:pt-5">
          <DialogTitle className="text-xl">{isEdit ? "Edit visit" : "Book a visit"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Move it, reassign it, or write down what changed."
              : "Who is coming in, when, and what for. Drop-off, pick-up, quote or anything else that needs a slot."}
          </DialogDescription>
        </DialogHeader>
        <BookingFlow
          values={values}
          pickers={pickers}
          keyboardOpen={box !== null}
          onCancel={() => onOpenChange(false)}
          onSaved={() => {
            onOpenChange(false);
            onSaved?.();
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything inside the dialog: the three steps, the strip, the button. Kept
 * apart from the Dialog so it can be drawn (and tested) on its own.
 */
export function BookingFlow({
  values: initial,
  pickers,
  onSaved,
  onCancel,
  keyboardOpen = false,
  now: nowProp,
  startOn,
}: {
  values: AppointmentFormValues;
  pickers: AppointmentPickers;
  onSaved: () => void;
  onCancel: () => void;
  /** A phone's keyboard is up: the steps row, the reminder note and the strip step aside so the field and the button keep their room. */
  keyboardOpen?: boolean;
  /** The clock, for "Today" and "Tomorrow". Tests pass one; the screen reads it once on opening. */
  now?: Date;
  /** The step to open on. Left out, a new booking opens on Who and an existing one on When. */
  startOn?: number;
}) {
  const ctx = pickers;
  const isEdit = Boolean(initial.id);

  const [values, setValues] = React.useState<AppointmentFormValues>(() => normalizeDuration(initial));
  const [kind, setKind] = React.useState<VisitKind | "">(() => kindOfTitle(initial.title));
  const [step, setStep] = React.useState(() => startOn ?? initialStep(initial));
  /** The steps that have been on screen: a tick means "you have been here and it is set", never "it came filled in". */
  const [visited, setVisited] = React.useState<number[]>(() =>
    initial.id ? STEPS.map((_, index) => index) : [startOn ?? initialStep(initial)],
  );
  // The length lives on the When step, not behind "More options", so it does not count here.
  const [more, setMore] = React.useState(() =>
    startsWithMoreDetails({ ...initial, duration: DEFAULT_DURATION }, true),
  );
  const [conflict, setConflict] = React.useState<AppointmentConflict | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [now] = React.useState(() => nowProp ?? new Date());
  // A keyboard is at hand: the cursor can go straight to the search box. On a touch screen it
  // would only throw the keyboard up over the people to tap.
  const [finePointer] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true,
  );

  /** The steps something was refused on: their messages stay up until each is fixed. */
  const [attempted, setAttempted] = React.useState<number[]>([]);
  /** Counts refusals so each one brings its message into view. */
  const [refusals, setRefusals] = React.useState(0);
  const refuse = (steps: number[]) => {
    setAttempted((current) => [...new Set([...current, ...steps])]);
    setRefusals((count) => count + 1);
  };

  const issues = validate(values, kind);
  const shown = issues.filter((issue) => attempted.includes(issue.step));
  const complete = issues.length === 0;
  const primary = primaryAction({
    step,
    editing: isEdit,
    complete,
    conflict: conflict !== null,
    chosenWho: hasCustomer(values),
  });
  const reason = blocker(values, kind)?.message ?? null;
  const blocked = primary.mode === "save" && !complete;

  /** Any change to the time or the tech makes an "already booked" warning stale. */
  const change = React.useCallback(
    (apply: (current: AppointmentFormValues) => AppointmentFormValues) => {
      setValues(apply);
      setConflict(null);
    },
    [],
  );

  const contentRef = React.useRef<HTMLDivElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRender = React.useRef(true);
  const shownRefusals = React.useRef(0);
  React.useEffect(() => {
    const opening = firstRender.current;
    firstRender.current = false;
    // Focus is always put inside the dialog on opening, never left on the page behind it (see stepFocus).
    const fieldHasCursor = Boolean(contentRef.current?.contains(document.activeElement));
    if (stepFocus({ step, finePointer, fieldHasCursor }) === "heading") headingRef.current?.focus({ preventScroll: true });
    // Opening is not a move: nothing to scroll to or past yet.
    if (opening) return;
    const refused = refusals !== shownRefusals.current;
    shownRefusals.current = refusals;
    const message = refused ? contentRef.current?.querySelector("[data-issues]") : null;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (message) message.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    else contentRef.current?.scrollTo({ top: 0 });
  }, [step, refusals, finePointer]);

  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(LAST_STEP, next));
    setStep(target);
    setVisited((current) => (current.includes(target) ? current : [...current, target]));
  };

  /** Next, here and on Enter. A step with something missing stops with its message. */
  function goNext() {
    if (issues.some((issue) => issue.step === step)) {
      refuse([step]);
      return;
    }
    goTo(step + 1);
  }

  async function save(confirmOverlap: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveAppointmentAction(initial.id, appointmentFormData(values, confirmOverlap));
      if (!result.ok) {
        if (result.conflict) {
          setConflict(result.conflict);
          setError(null);
          return;
        }
        setConflict(null);
        setError(result.error);
        // The refusal lands on the step that can fix it.
        const target = stepForServerError(result.error);
        if (target !== null) {
          setAttempted((current) => [...new Set([...current, target])]);
          goTo(target);
        }
        return;
      }
      toast.success(isEdit ? "Appointment updated." : "Appointment booked.");
      onSaved();
    } catch {
      setConflict(null);
      setError("Could not reach the shop's server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Book, or say what is missing and take you to it. */
  function submit() {
    if (issues.length > 0) {
      refuse(issues.map((issue) => issue.step));
      goTo(issues[0].step);
      return;
    }
    void save(false);
  }

  function runPrimary() {
    if (primary.mode === "next") goNext();
    else if (primary.mode === "overlap") void save(true);
    else submit();
  }

  // Enter in a field does what the big button does. A scanner or a stray Enter
  // never books a clash on its own: after a warning it only asks again.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (event.target.type === "checkbox") return;
    if (primary.mode === "next") goNext();
    else submit();
  }

  const parts = summaryParts(values, ctx, now);
  const hint = step === 0 ? whoHint(ctx.customers) : STEPS[step].hint;
  const done = STEPS.map((_, index) => visited.includes(index) && stepDone(values, ctx, index));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (primary.mode === "save") submit();
      }}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Moving a booking the customer has already been reminded about is
          worth knowing before you press save, so it sits at the top. */}
      {initial.reminderSentLabel ? (
        <p
          className={cn(
            "mx-4 mb-2 flex w-fit max-w-[calc(100%-2rem)] shrink-0 items-center gap-2 rounded-lg bg-status-resolved-bg px-3 py-1.5 text-sm font-medium text-status-resolved-fg sm:mx-6",
            keyboardOpen && "max-sm:hidden",
          )}
        >
          <Check aria-hidden className="size-4 shrink-0" />
          <span className="truncate">Reminder sent {initial.reminderSentLabel}</span>
        </p>
      ) : null}

      <div className={cn("shrink-0 px-4 pb-3 sm:px-6", keyboardOpen && "max-sm:hidden")}>
        <Stepper step={step} done={done} onStep={goTo} />
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border px-4 py-4 sm:px-6"
      >
        <section aria-labelledby="bk-heading" className="flex flex-col gap-4">
          <div>
            <h2
              id="bk-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none"
            >
              {STEPS[step].title}
            </h2>
            {hint ? <p className="text-base text-muted-foreground">{hint}</p> : null}
          </div>

          {step === 0 ? (
            <WhoStep
              values={values}
              ctx={ctx}
              setValues={setValues}
              onChosen={() => goTo(1)}
              issues={shown}
              focusSearch={finePointer}
            />
          ) : null}
          {step === 1 ? <WhenStep values={values} change={change} now={now} issues={shown} /> : null}
          {step === 2 ? (
            <WhatStep
              values={values}
              kind={kind}
              ctx={ctx}
              setValues={setValues}
              change={change}
              onKind={(next) => {
                setValues((current) => withKind(current, kind, next));
                setKind(next);
              }}
              more={more}
              onMore={() => setMore((open) => !open)}
              issues={shown}
            />
          ) : null}
        </section>
      </div>

      <div className="shrink-0 border-t border-border-strong bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}

        {conflict ? (
          <div
            role="alert"
            className="mb-3 flex max-h-[40dvh] flex-col gap-1.5 overflow-y-auto rounded-xl border border-status-in-progress/40 bg-status-in-progress-bg px-4 py-3"
          >
            <span className="flex items-center gap-2 text-base font-bold text-status-in-progress-fg">
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              {conflict.techName} is already booked
            </span>
            <span className="text-[15px] leading-snug text-status-in-progress-fg">
              <strong className="font-semibold">{conflict.title}</strong>
              {conflict.customerName ? ` · ${conflict.customerName}` : ""}
              <br />
              {conflict.when}
            </span>
            <span className="text-sm text-status-in-progress-fg/80">
              Book it anyway if that&rsquo;s intentional, or change the time or the tech.
            </span>
          </div>
        ) : null}

        <SummaryStrip
          parts={parts}
          onStep={goTo}
          className={cn("mb-3 [@media(max-height:520px)]:hidden", keyboardOpen && "max-sm:hidden")}
        />

        {step === LAST_STEP && blocked && reason ? (
          <p id="bk-reason" role="status" className="mb-2 text-[15px] font-medium text-muted-foreground">
            {reason}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => (step === 0 ? onCancel() : goTo(step - 1))}
            className="h-14 shrink-0 px-5 text-base"
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            type={primary.mode === "save" ? "submit" : "button"}
            disabled={busy}
            aria-disabled={blocked ? true : undefined}
            aria-describedby={blocked && step === LAST_STEP && reason ? "bk-reason" : undefined}
            onClick={primary.mode === "save" ? undefined : runPrimary}
            className={cn("h-14 min-w-0 flex-1 text-base", blocked && "opacity-60")}
          >
            {primary.mode === "save" ? <CalendarPlus /> : primary.mode === "overlap" ? <Check /> : null}
            {busy ? (isEdit ? "Saving…" : "Booking…") : primary.label}
          </Button>
        </div>
      </div>
    </form>
  );
}
