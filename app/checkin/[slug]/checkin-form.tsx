"use client";

import * as React from "react";
import Link from "next/link";
import SignatureCanvas from "react-signature-canvas";
import { ArrowLeft, CheckCircle2, LayoutGrid, Loader2, Package, Pencil } from "lucide-react";

import { PublicShell } from "@/components/public/shell";
import { BIG_INPUT, HUGE_BUTTON } from "@/components/public/sizes";
import { ChoiceChips, StepBar, StepHeader } from "@/components/public/steps";
import { problemOptions, problemVisualFor } from "@/components/tickets/intake/flow";
import { ChipButton, IconTile, IssueLines, MoreTile, MoreToggle, PhotoTile } from "@/components/tickets/intake/tiles";
import { PROBLEM_ICONS } from "@/components/tickets/intake/visuals";
import type { CheckinFieldKey } from "@/components/settings/checkin-meta";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { easyIntakeProfile } from "@/lib/device-intake";
import { FIRST_SCREEN_BOXES } from "@/lib/intake-options";
import { fewProblems, problemHint, type PublicShop } from "@/lib/portal-display";
import { submitCheckinAction } from "./actions";
import {
  CHECKIN_STEPS,
  EMPTY_CHECKIN,
  LAST_CHECKIN_STEP,
  checkinDeviceLabel,
  checkinFields,
  checkinIssues,
  firstOpenStep,
  isOtherKind,
  stepForError,
  type CheckinState,
} from "./flow";

/**
 * The check-in a walk-in does on their own phone, or on the tablet by the door,
 * built like the shop's own New repair screen: one question per screen, big
 * picture boxes, the choices so far as chips on top, and one big button at the
 * bottom.
 *
 *   1 What are you leaving with us?   device boxes (the shop's own list)
 *   2 What is wrong with it?          problem boxes, plus an optional note
 *   3 Who are you?                    name, mobile, email
 *   4 Sign and you are done           terms, tick, signature, "Check me in"
 *
 * Kiosk mode (?kiosk=1) drops every link off the page and hands the tablet back
 * to the queue on its own a few seconds after a check-in.
 */

const KIOSK_RESET_SECONDS = 8;

export type CheckinKind = { label: string; type: string; photo: string | null };

export function CheckinForm({
  slug,
  shop,
  kinds,
  problemTypes,
  problemPictures,
  terms,
  fields,
  kiosk,
  hubLive,
}: {
  slug: string;
  shop: PublicShop;
  kinds: CheckinKind[];
  problemTypes: string[];
  problemPictures: Record<string, string>;
  terms: string;
  fields: Record<CheckinFieldKey, boolean>;
  kiosk: boolean;
  /** The shop page and its "check my repair" box are on, so a returning customer can be sent there. */
  hubLive: boolean;
}) {
  const [state, setState] = React.useState<CheckinState>(EMPTY_CHECKIN);
  const [step, setStep] = React.useState(0);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [repairNumber, setRepairNumber] = React.useState<number | null>(null);
  const [allKinds, setAllKinds] = React.useState(false);
  const [moreDetails, setMoreDetails] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(KIOSK_RESET_SECONDS);

  const formRef = React.useRef<HTMLFormElement | null>(null);
  const padRef = React.useRef<SignatureCanvas | null>(null);
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const moved = React.useRef(false);

  const update = (patch: Partial<CheckinState>) => setState((current) => ({ ...current, ...patch }));
  const kind = kinds.find((item) => item.type === state.kindType);
  const deviceLabel = checkinDeviceLabel(state, kind?.label ?? "");

  // A new question gets the focus and the top of the screen.
  React.useEffect(() => {
    if (!moved.current) return;
    titleRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const reset = React.useCallback(() => {
    setState(EMPTY_CHECKIN);
    setStep(0);
    setIssues([]);
    setRepairNumber(null);
    setAllKinds(false);
    setMoreDetails(false);
    setSecondsLeft(KIOSK_RESET_SECONDS);
    padRef.current?.clear();
    formRef.current?.reset();
    moved.current = false;
    window.scrollTo({ top: 0 });
  }, []);

  // Coming back to the last step: the pad is new, so draw the signature already given back onto it.
  React.useEffect(() => {
    if (step !== LAST_CHECKIN_STEP || !state.signature) return;
    padRef.current?.fromDataURL(state.signature);
    // Only when the step is entered; a new stroke updates state.signature itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Kiosk only: count down, then hand the tablet back to the queue.
  React.useEffect(() => {
    if (!kiosk || repairNumber === null) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft <= 1) reset();
      else setSecondsLeft((left) => left - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [kiosk, repairNumber, secondsLeft, reset]);

  function go(next: number) {
    moved.current = true;
    setIssues([]);
    setStep(next);
  }

  function next() {
    const found = checkinIssues(step, state);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    go(step + 1);
  }

  async function send() {
    const open = firstOpenStep(state);
    if (open !== null) {
      if (open !== step) go(open);
      setIssues(checkinIssues(open, state));
      return;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(checkinFields(state, fields))) form.set(key, value);
    // The honeypot: a person never sees it; a bot fills it and is quietly ignored.
    form.set("website", String(new FormData(formRef.current ?? undefined).get("website") ?? ""));

    setBusy(true);
    const result = await submitCheckinAction(slug, form);
    setBusy(false);
    if (!result.ok) {
      const at = stepForError(result.error);
      if (at !== step) go(at);
      setIssues([result.error]);
      return;
    }
    setIssues([]);
    setSecondsLeft(KIOSK_RESET_SECONDS);
    setRepairNumber(result.ticketNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------------------------------------------------------------------ done --
  if (repairNumber !== null) {
    return (
      <PublicShell shop={shop} eyebrow="Device check-in" kiosk={kiosk} legalNewTab>
        <section className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <CheckCircle2 className="size-16 text-status-resolved" aria-hidden />
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight">You are checked in</h1>
            <p className="text-[17px] text-muted-foreground">
              {kiosk ? "Please take a seat. We will call your name." : `${shop.name} has your ${deviceLabel || "device"}.`}
            </p>
          </div>
          <div className="rounded-2xl bg-surface-hover px-10 py-5">
            <div className="text-[15px] font-semibold text-muted-foreground">Your repair number</div>
            <div className="text-5xl font-bold tabular-nums">#{repairNumber}</div>
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
            We sent you a message with a link to follow your repair. {shop.name} will contact you before any work that costs money.
          </p>
          {kiosk ? (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Button type="button" size="lg" className={HUGE_BUTTON} onClick={reset}>
                Done
              </Button>
              <p role="timer" aria-live="off" className="text-[14px] text-muted-foreground">
                This screen clears by itself in {secondsLeft} seconds.
              </p>
            </div>
          ) : (
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Button asChild size="lg" className={HUGE_BUTTON}>
                <Link href={`/portal?shop=${slug}`}>Follow my repair</Link>
              </Button>
              <Button type="button" size="lg" variant="outline" className="h-12 min-h-12 w-full rounded-xl text-[15px]" onClick={reset}>
                Check in another device
              </Button>
            </div>
          )}
        </section>
      </PublicShell>
    );
  }

  // ------------------------------------------------------------------ steps --
  const shownKinds = allKinds || kinds.length <= FIRST_SCREEN_BOXES ? kinds : kinds.slice(0, FIRST_SCREEN_BOXES - 1);
  const makes = state.kindType && !isOtherKind(state) ? easyIntakeProfile(state.kindType).makes.slice(0, 8) : [];
  const problems = fewProblems(problemOptions(isOtherKind(state) ? state.otherText : state.kindType, problemTypes));
  const tileGrid = cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", kiosk && "sm:gap-4");
  const field = cn(BIG_INPUT, kiosk && "h-14 text-lg");
  const hasMore = fields.serial || fields.unlockCode;

  return (
    <PublicShell shop={shop} eyebrow="Device check-in" kiosk={kiosk} legalNewTab hideContact={kiosk}>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step === LAST_CHECKIN_STEP) void send();
          else next();
        }}
        className="relative flex flex-col gap-5"
      >
        {/* Honeypot: off-screen, not display:none, so bots that skip hidden
            inputs still fill it in. Never shown to a person. */}
        <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <StepHeader
          step={step}
          total={CHECKIN_STEPS.length}
          title={CHECKIN_STEPS[step].title}
          hint={step === 0 ? `Tell ${shop.name} what you are leaving and what is wrong. It takes about a minute.` : CHECKIN_STEPS[step].hint}
          titleRef={titleRef}
        />
        <ChoiceChips items={[step > 0 ? deviceLabel : "", step > 1 ? state.problem : "", step > 2 ? state.name.trim() : ""]} />
        <IssueLines messages={issues} />

        {/* ------------------------------------------------ 1. the device -- */}
        {step === 0 ? (
          state.kindType ? (
            <div className="flex flex-col gap-5">
              <Chosen
                label={kind?.label ?? state.kindType}
                onChange={() => update({ kindType: "", otherText: "", make: "", model: "" })}
              />

              {isOtherKind(state) ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkin-device" className="text-[15px]">What is it?</Label>
                  <Input
                    id="checkin-device"
                    value={state.otherText}
                    maxLength={60}
                    autoComplete="off"
                    onChange={(event) => update({ otherText: event.target.value })}
                    placeholder="For example: e-scooter, smart speaker"
                    className={field}
                  />
                </div>
              ) : null}

              {fields.make && makes.length > 0 ? (
                <div role="group" aria-labelledby="checkin-brand" className="flex flex-col gap-2">
                  <span id="checkin-brand" className="text-[15px] font-semibold">
                    Brand <span className="font-normal text-muted-foreground">(if you know it)</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {makes.map((make) => (
                      <ChipButton key={make} selected={state.make === make} onClick={() => update({ make: state.make === make ? "" : make })}>
                        {make}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              ) : null}

              {fields.make && makes.length === 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkin-make" className="text-[15px]">
                    Brand <span className="font-normal text-muted-foreground">(if you know it)</span>
                  </Label>
                  <Input id="checkin-make" value={state.make} maxLength={60} onChange={(event) => update({ make: event.target.value })} className={field} />
                </div>
              ) : null}

              {fields.model ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkin-model" className="text-[15px]">
                    Model <span className="font-normal text-muted-foreground">(if you know it)</span>
                  </Label>
                  <Input
                    id="checkin-model"
                    value={state.model}
                    maxLength={60}
                    autoComplete="off"
                    onChange={(event) => update({ model: event.target.value })}
                    placeholder="For example: iPhone 14, Galaxy S23, PS5"
                    className={field}
                  />
                </div>
              ) : null}

              {hasMore ? (
                <div className="flex flex-col gap-3">
                  <MoreToggle open={moreDetails} onToggle={() => setMoreDetails((open) => !open)}>
                    {fields.serial && fields.unlockCode ? "Serial number and passcode (optional)" : fields.serial ? "Serial number (optional)" : "Passcode (optional)"}
                  </MoreToggle>
                  {moreDetails ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {fields.serial ? (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="checkin-serial" className="text-[15px]">Serial number</Label>
                          <Input id="checkin-serial" value={state.serial} maxLength={80} autoComplete="off" onChange={(event) => update({ serial: event.target.value })} className={field} />
                          <p className="text-[14px] text-muted-foreground">Usually on a sticker or in Settings, About.</p>
                        </div>
                      ) : null}
                      {fields.unlockCode ? (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="checkin-code" className="text-[15px]">Passcode</Label>
                          <Input id="checkin-code" value={state.unlockCode} maxLength={60} autoComplete="off" onChange={(event) => update({ unlockCode: event.target.value })} className={field} />
                          <p className="text-[14px] text-muted-foreground">So we can test the repair. Kept with your repair, never shown in public.</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div role="group" aria-label="Kind of device" className={tileGrid}>
              {shownKinds.map((item) =>
                item.photo ? (
                  <PhotoTile key={item.type} photo={item.photo} title={item.label} onClick={() => update({ kindType: item.type })} />
                ) : (
                  <IconTile key={item.type} icon={Package} title={item.label} onClick={() => update({ kindType: item.type })} />
                ),
              )}
              {kinds.length > FIRST_SCREEN_BOXES ? (
                <MoreTile
                  icon={LayoutGrid}
                  title={allKinds ? "Fewer devices" : "More devices"}
                  detail={allKinds ? undefined : `${kinds.length - shownKinds.length} more`}
                  expanded={allKinds}
                  onClick={() => setAllKinds((open) => !open)}
                />
              ) : null}
            </div>
          )
        ) : null}

        {/* ----------------------------------------------- 2. the problem -- */}
        {step === 1 ? (
          state.problem ? (
            <div className="flex flex-col gap-5">
              <Chosen label={state.problem} onChange={() => update({ problem: "" })} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checkin-note" className="text-[15px]">
                  Anything else we should know? <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="checkin-note"
                  value={state.note}
                  rows={kiosk ? 5 : 4}
                  maxLength={4000}
                  onChange={(event) => update({ note: event.target.value })}
                  placeholder="When it started, what you have tried. For example: dropped it yesterday, still turns on."
                  className={cn("rounded-xl px-4 py-3 text-base", kiosk && "text-lg")}
                />
              </div>
            </div>
          ) : (
            <div role="group" aria-label="What is wrong" className={tileGrid}>
              {problems.map((label) => {
                const visual = problemVisualFor(label, problemPictures);
                const detail = problemHint(label) || undefined;
                return visual.kind === "photo" ? (
                  <PhotoTile key={label} photo={visual.src} title={label} detail={detail} onClick={() => update({ problem: label })} />
                ) : (
                  <IconTile key={label} icon={PROBLEM_ICONS[visual.icon]} title={label} detail={detail} onClick={() => update({ problem: label })} />
                );
              })}
            </div>
          )
        ) : null}

        {/* ------------------------------------------------------- 3. you -- */}
        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkin-name" className="text-[15px]">Your name</Label>
              <Input id="checkin-name" value={state.name} maxLength={120} autoComplete="name" onChange={(event) => update({ name: event.target.value })} placeholder="First and last name" className={field} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checkin-phone" className="text-[15px]">Mobile number</Label>
                <Input id="checkin-phone" type="tel" inputMode="tel" value={state.phone} maxLength={40} autoComplete="tel" onChange={(event) => update({ phone: event.target.value })} placeholder="(512) 555-0142" className={field} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checkin-email" className="text-[15px]">Email</Label>
                <Input id="checkin-email" type="email" inputMode="email" value={state.email} maxLength={160} autoComplete="email" onChange={(event) => update({ email: event.target.value })} placeholder="you@example.com" className={field} />
              </div>
            </div>
            <p className="text-[14px] text-muted-foreground">One of the two is enough. We send the link to follow your repair there.</p>
          </div>
        ) : null}

        {/* ---------------------------------------------------- 4. sign -- */}
        {step === 3 ? (
          <div className="flex flex-col gap-5">
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface px-4 py-3.5 text-[15px] leading-relaxed text-muted-foreground" tabIndex={0} aria-label="The shop's terms">
              {terms}
            </div>

            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <Checkbox checked={state.accepted} onCheckedChange={(value) => update({ accepted: value === true })} className="size-6" />
              <span className={cn("font-semibold", kiosk ? "text-lg" : "text-[15px]")}>I have read and accept these terms</span>
            </label>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">Sign here</span>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-xl px-4 text-[15px]"
                  onClick={() => {
                    padRef.current?.clear();
                    update({ signature: "" });
                  }}
                >
                  Clear
                </Button>
              </div>
              {/* White paper and a dark pen in every theme: this image is
                  reprinted on the work order, and a white signature would vanish. */}
              <div className="rounded-xl border border-border-strong bg-white p-1">
                <SignatureCanvas
                  ref={padRef}
                  penColor="#1c1a17"
                  onEnd={() => {
                    const pad = padRef.current;
                    update({ signature: pad && !pad.isEmpty() ? pad.toDataURL("image/png") : "" });
                  }}
                  canvasProps={{
                    className: cn("block w-full touch-none rounded-lg", kiosk ? "h-[220px]" : "h-[170px]"),
                    "aria-label": "Signature pad",
                  }}
                />
              </div>
              <p className="text-[14px] text-muted-foreground">Sign with your finger, a stylus or a mouse.</p>
            </div>

            <p className="text-[14px] leading-relaxed text-muted-foreground">
              We use your details only for this repair.{" "}
              {kiosk ? (
                "Ask at the counter to read our privacy policy and terms of service."
              ) : (
                <>
                  Read our{" "}
                  <Link href="/privacy" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
                    privacy policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/terms" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
                    terms
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        ) : null}

        <StepBar>
          {step > 0 ? (
            <Button type="button" size="lg" variant="outline" className={cn("h-14 min-h-14 rounded-xl px-5 text-base", kiosk && "h-16 text-lg")} onClick={() => go(step - 1)}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} className={cn(HUGE_BUTTON, "flex-1 sm:ml-auto sm:w-auto sm:flex-none sm:min-w-64", kiosk && "h-16 text-lg")}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {step === LAST_CHECKIN_STEP ? (busy ? "Checking you in…" : "Check me in") : "Next"}
          </Button>
        </StepBar>

        {!kiosk && hubLive && step === 0 ? (
          <p className="text-center text-[15px] text-muted-foreground">
            Checking on a repair you already left?{" "}
            <Link href={`/s/${slug}#status`} className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
              Check your repair
            </Link>
          </p>
        ) : null}
      </form>
    </PublicShell>
  );
}

/** A choice already made, shown big with a way to change it. */
function Chosen({ label, onChange }: { label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-accent bg-surface px-4 text-left ring-1 ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[15px] font-medium text-muted-foreground">
        <Pencil aria-hidden className="size-4" />
        Change
      </span>
    </button>
  );
}
