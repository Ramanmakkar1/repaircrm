"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import {
  AlertCircle,
  CalendarClock,
  HeartHandshake,
  Mail,
  MessageSquare,
  PenLine,
  Receipt,
  ShieldCheck,
  UserPlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { IDLE_FORM_STATE, type FormState } from "@/components/billing/types";
import { ChipButton, Field, IconTile } from "@/components/tickets/intake/tiles";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  BODY_MAX_CHARS,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TRIGGERS,
  MAX_DELAY_DAYS,
  PLACEHOLDERS,
  SMS_MAX_CHARS,
  SUBJECT_MAX_CHARS,
  TOKEN_WORDS,
  TRIGGER_WORDS,
  WAIT_CHOICES,
  asChannel,
  asTrigger,
  fromFriendlyBody,
  previewVars,
  renderMessage,
  toFriendlyBody,
  waitWords,
  type CampaignChannel,
  type CampaignTemplate,
  type CampaignTrigger,
} from "./meta";

const TRIGGER_ICON: Record<CampaignTrigger, LucideIcon> = {
  TICKET_RESOLVED: Wrench,
  INVOICE_PAID: Receipt,
  CUSTOMER_CREATED: UserPlus,
};

const TEMPLATE_ICON: Record<CampaignTemplate["icon"], LucideIcon> = {
  "shield-check": ShieldCheck,
  "calendar-clock": CalendarClock,
  "heart-handshake": HeartHandshake,
};

export type CampaignFlowInitial = {
  id?: string;
  name?: string;
  trigger?: string;
  delayDays?: number;
  channel?: string;
  subject?: string | null;
  body?: string;
  active?: boolean;
};

/**
 * Easy mode's campaign editor, a step at a time like New repair:
 *
 *   1. Start      a ready-written message (the three every shop sends) or your own
 *   2. When       after a repair / a payment / a new customer, how long to wait, email or text
 *   3. Message    the words, with "[First name]" style blanks and a phone preview
 *
 * A live summary sits above ONE big button: "Next" until the last step, then
 * "Turn on" for a new campaign (with "Save, keep it off" beside it) or "Save
 * changes" when editing, which opens straight on the message.
 *
 * It posts exactly what the Full-mode form posts (name, trigger, delayDays,
 * channel, subject, body with its {{tokens}}, active) to the same action.
 */
export function CampaignFlow({
  action,
  shopName,
  initial = {},
  editing = false,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  shopName: string;
  initial?: CampaignFlowInitial;
  /** An existing campaign: no "Start" step, opens on the message. */
  editing?: boolean;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  const steps = editing ? (["When", "Message"] as const) : (["Start", "When", "Message"] as const);
  const messageStep = steps.length - 1;
  // A campaign handed over already written (a template, or the one being edited) skips the picking.
  const [step, setStep] = React.useState(() => (editing ? messageStep : initial.body ? 1 : 0));

  const [name, setName] = React.useState(initial.name ?? "");
  const [trigger, setTrigger] = React.useState<CampaignTrigger>(asTrigger(initial.trigger));
  const [delayDays, setDelayDays] = React.useState(initial.delayDays ?? 14);
  const [otherWait, setOtherWait] = React.useState(() => !WAIT_CHOICES.some((choice) => choice.days === (initial.delayDays ?? 14)));
  const [channel, setChannel] = React.useState<CampaignChannel>(asChannel(initial.channel));
  const [subject, setSubject] = React.useState(initial.subject ?? "");
  const [text, setText] = React.useState(() => toFriendlyBody(initial.body ?? ""));
  const [missing, setMissing] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const isSms = channel === "SMS";
  const body = fromFriendlyBody(text);
  const vars = previewVars(shopName);
  const preview = renderMessage(body, vars);
  const previewSubject = renderMessage(subject, vars);
  const overBudget = isSms && preview.length > SMS_MAX_CHARS;

  /** What still stops saving, in words, or null. The server says the same. */
  const blocker = !name.trim()
    ? "Give it a name (only you see it)."
    : !body.trim()
      ? "Write the message that goes out."
      : !isSms && !subject.trim()
        ? "An email needs a subject line."
        : null;

  function pickTemplate(template: CampaignTemplate | null) {
    if (template) {
      setName(template.name);
      setTrigger(template.trigger);
      setDelayDays(template.delayDays);
      setOtherWait(!WAIT_CHOICES.some((choice) => choice.days === template.delayDays));
      setChannel(template.channel);
      setSubject(template.subject);
      setText(toFriendlyBody(template.body));
    }
    setStep(1);
  }

  /** Puts "[First name]" in at the cursor. */
  function insertWord(token: keyof typeof TOKEN_WORDS) {
    const snippet = `[${TOKEN_WORDS[token]}]`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    setText(`${text.slice(0, start)}${snippet}${text.slice(end)}`);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  const summary = [
    { label: "When", value: TRIGGER_WORDS[trigger] },
    { label: "Wait", value: waitWords(delayDays) },
    { label: "How", value: isSms ? "Text message" : "Email" },
  ];

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (blocker) {
          event.preventDefault();
          setMissing(blocker);
          setStep(messageStep);
        }
      }}
      className="flex flex-col gap-5"
    >
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="trigger" value={trigger} />
      <input type="hidden" name="delayDays" value={String(delayDays)} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="subject" value={isSms ? "" : subject} />
      <input type="hidden" name="body" value={body} />

      {/* The steps, as big tabs: tap one to go back to it. */}
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index === step ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
              )}
            >
              <span className={cn("flex size-7 items-center justify-center rounded-full text-sm", index === step ? "bg-accent-foreground text-accent" : "bg-surface-hover")}>
                {index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {/* What stopped the save: it goes away by itself once fixed. */}
      {state.error || (missing && blocker) ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{missing && blocker ? blocker : state.error}</span>
        </div>
      ) : null}

      {steps[step] === "Start" ? (
        <section aria-labelledby="cf-start" className="flex flex-col gap-3">
          <div>
            <h2 id="cf-start" className="text-2xl font-semibold tracking-tight">What would you like to send?</h2>
            <p className="text-base text-muted-foreground">Start from a message that is already written, or write your own.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CAMPAIGN_TEMPLATES.map((template) => (
              <IconTile
                key={template.id}
                icon={TEMPLATE_ICON[template.icon]}
                title={template.name}
                detail={`${TRIGGER_WORDS[template.trigger]}, ${waitWords(template.delayDays).toLowerCase()}`}
                onClick={() => pickTemplate(template)}
              />
            ))}
            <IconTile icon={PenLine} title="Write my own" detail="Your own timing and words" onClick={() => pickTemplate(null)} />
          </div>
        </section>
      ) : null}

      {steps[step] === "When" ? (
        <section aria-labelledby="cf-when" className="flex flex-col gap-5">
          <h2 id="cf-when" className="text-2xl font-semibold tracking-tight">When does it go out?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CAMPAIGN_TRIGGERS.map((value) => (
              <IconTile key={value} icon={TRIGGER_ICON[value]} title={TRIGGER_WORDS[value]} selected={trigger === value} onClick={() => setTrigger(value)} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">How long after?</h3>
            <div className="flex flex-wrap gap-2">
              {WAIT_CHOICES.map((choice) => (
                <ChipButton
                  key={choice.days}
                  selected={!otherWait && delayDays === choice.days}
                  onClick={() => {
                    setOtherWait(false);
                    setDelayDays(choice.days);
                  }}
                >
                  {choice.label}
                </ChipButton>
              ))}
              <ChipButton selected={otherWait} onClick={() => setOtherWait(true)}>
                Other
              </ChipButton>
            </div>
            {otherWait ? (
              <Field label="Number of days" htmlFor="cf-days" hint={waitWords(delayDays)}>
                <Input
                  id="cf-days"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_DELAY_DAYS}
                  value={String(delayDays)}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    setDelayDays(Number.isFinite(next) ? Math.min(Math.max(next, 0), MAX_DELAY_DAYS) : 0);
                  }}
                  className="h-14 w-40 text-lg"
                />
              </Field>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Send it as</h3>
            <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
              <IconTile icon={Mail} title="Email" detail="To customers who said yes to email" selected={!isSms} onClick={() => setChannel("EMAIL")} />
              <IconTile icon={MessageSquare} title="Text message" detail="To customers who said yes to texts" selected={isSms} onClick={() => setChannel("SMS")} />
            </div>
          </div>
        </section>
      ) : null}

      {steps[step] === "Message" ? (
        <section aria-labelledby="cf-message" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-4">
            <h2 id="cf-message" className="text-2xl font-semibold tracking-tight">What does it say?</h2>
            {!isSms ? (
              <Field label="Subject line" htmlFor="cf-subject">
                <Input
                  id="cf-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={SUBJECT_MAX_CHARS}
                  placeholder="How is your repair holding up?"
                  className="h-14 text-lg"
                />
              </Field>
            ) : null}
            <Field
              label="Message"
              htmlFor="cf-body"
              hint={isSms ? `${preview.length} of ${SMS_MAX_CHARS} letters${overBudget ? ": too long, the end is cut off" : ""}` : undefined}
            >
              <Textarea
                id="cf-body"
                ref={bodyRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={isSms ? 5 : 10}
                maxLength={BODY_MAX_CHARS}
                placeholder="Hi [First name], ..."
                className={cn("text-lg leading-relaxed", overBudget && "border-destructive")}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Put in their details</span>
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDERS.filter((placeholder) => placeholder.triggers === "all" || placeholder.triggers.includes(trigger)).map((placeholder) => (
                  <ChipButton key={placeholder.token} onClick={() => insertWord(placeholder.token)}>
                    + {TOKEN_WORDS[placeholder.token]}
                  </ChipButton>
                ))}
              </div>
            </div>
            <Field label="Name (only you see it)" htmlFor="cf-name">
              <Input
                id="cf-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="2-week follow-up"
                className="h-12 text-base"
              />
            </Field>
          </div>

          <MessagePreview sms={isSms} subject={previewSubject} body={preview} />
        </section>
      ) : null}

      {/* The live summary and the one big button. On a phone they stay at the bottom of the screen. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <dl className="grid grid-cols-3 gap-2">
          {summary.map((part) => (
            <div key={part.label} className="min-w-0 rounded-xl bg-surface-hover px-3 py-2">
              <dt className="text-[13px] text-muted-foreground">{part.label}</dt>
              <dd className="truncate text-[15px] font-semibold">{part.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          {step === 0 ? (
            <Button variant="ghost" asChild className="h-14 px-5 text-base">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="h-14 px-5 text-base" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < messageStep ? (
            // On "Start" the tiles themselves move on.
            steps[step] === "Start" ? null : (
              <Button type="button" className="h-14 min-w-0 flex-1 text-base" onClick={() => setStep(step + 1)}>
                Next: {steps[step + 1]}
              </Button>
            )
          ) : editing ? (
            <SubmitButton name="active" value={initial.active === false ? "false" : "true"} pendingLabel="Saving…" className="h-14 min-w-0 flex-1 text-base">
              Save changes
            </SubmitButton>
          ) : (
            <>
              <SubmitButton name="active" value="true" pendingLabel="Turning on…" className="h-14 min-w-0 flex-1 text-base">
                Turn on
              </SubmitButton>
              <SubmitButton name="active" value="false" variant="outline" pendingLabel="Saving…" className="h-14 px-5 text-base">
                Save, keep it off
              </SubmitButton>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

/** The message the way the customer sees it: a text bubble on a phone, or an email. Sample values for the blanks. */
export function MessagePreview({ sms, subject, body }: { sms: boolean; subject: string; body: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {sms ? <MessageSquare className="size-4" aria-hidden /> : <Mail className="size-4" aria-hidden />}
        {sms ? "What Alex gets (a text)" : "What Alex gets (an email)"}
      </figcaption>
      {sms ? (
        <div className="rounded-[2rem] border border-border bg-surface-hover p-4">
          <p className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-3 text-[15px] leading-relaxed text-accent-foreground">
            {body || "Your message shows here as you write it."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          {subject ? <p className="mb-2 border-b border-border pb-2 text-base font-semibold">{subject}</p> : null}
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{body || "Your message shows here as you write it."}</p>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">Shown with a made-up customer. Each real message uses the customer&rsquo;s own name and details.</p>
    </figure>
  );
}
