"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Eye, Mail, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/cn";
import { SubmitButton } from "@/components/billing/submit-button";
import { IDLE_FORM_STATE, type FormState } from "@/components/billing/types";
import {
  BODY_MAX_CHARS,
  CHANNEL_OPTIONS,
  MAX_DELAY_DAYS,
  PLACEHOLDERS,
  SMS_MAX_CHARS,
  SUBJECT_MAX_CHARS,
  TRIGGER_HINT,
  TRIGGER_OPTIONS,
  asChannel,
  asTrigger,
  delayLabel,
  previewVars,
  renderMessage,
} from "./meta";

/**
 * The one form behind /marketing/new and /marketing/[id]/edit.
 *
 * The body is controlled state rather than an uncontrolled input, because two
 * things need to read it as it is typed: the live preview, and the placeholder
 * chips, which splice a token in at the caret instead of making the writer type
 * `{{firstName}}` by hand and get it subtly wrong.
 */
export function CampaignForm({
  action,
  shopName,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  /** Real shop name, so the preview reads like the message the customer gets. */
  shopName: string;
  initial?: {
    id?: string;
    name?: string;
    trigger?: string;
    delayDays?: number;
    channel?: string;
    subject?: string | null;
    body?: string;
    active?: boolean;
  };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  // Radix Select/Switch are controlled so the picks survive a failed submit
  // (the server action re-renders this form with its error).
  const [trigger, setTrigger] = React.useState(asTrigger(initial?.trigger));
  const [channel, setChannel] = React.useState(asChannel(initial?.channel));
  const [active, setActive] = React.useState(initial?.active ?? true);
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [delayDays, setDelayDays] = React.useState(String(initial?.delayDays ?? 14));

  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const isSms = channel === "SMS";
  const overBudget = isSms && body.length > SMS_MAX_CHARS;
  const vars = previewVars(shopName);
  const previewBody = renderMessage(body, vars);
  const previewSubject = renderMessage(subject, vars);
  const parsedDelay = Number.parseInt(delayDays, 10);

  /** Splices `{{token}}` in at the caret and puts the caret after it. */
  function insertToken(token: string) {
    const el = bodyRef.current;
    const snippet = `{{${token}}}`;
    if (!el) {
      setBody((current) => current + snippet);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? start;
    const next = `${body.slice(0, start)}${snippet}${body.slice(end)}`;
    setBody(next);
    // The caret has to be restored after React re-renders the value.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="trigger" value={trigger} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="active" value={active ? "true" : "false"} />

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {/* --------------------------------------------------------- settings */}
      <Card>
        <CardHeader>
          <CardTitle>When it goes out</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={initial?.name ?? ""}
              placeholder="2-Week Follow-Up"
              maxLength={120}
              required
            />
            <p className="text-[13.5px] text-muted-foreground">
              Internal only — the customer never sees it.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trigger">Trigger</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(asTrigger(v))}>
              <SelectTrigger id="trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13.5px] text-muted-foreground">
              {TRIGGER_HINT[trigger]}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="delayDays">Send after</Label>
            <div className="flex items-center gap-2.5">
              <Input
                id="delayDays"
                name="delayDays"
                type="number"
                min={0}
                max={MAX_DELAY_DAYS}
                inputMode="numeric"
                className="w-24 text-right tabular-nums"
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-[13.5px] text-muted-foreground">
              {Number.isFinite(parsedDelay)
                ? delayLabel(parsedDelay)
                : "0 sends straight away."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="channel">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(asChannel(v))}>
              <SelectTrigger id="channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13.5px] text-muted-foreground">
              {isSms
                ? "Only customers who opted in to texts are messaged."
                : "Only customers who opted in to email are messaged."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="active">Status</Label>
            <div className="flex h-10 items-center gap-3">
              <Switch
                id="active"
                checked={active}
                onCheckedChange={setActive}
                aria-label="Campaign active"
              />
              <span className="text-sm font-semibold text-foreground">
                {active ? "Active" : "Paused"}
              </span>
            </div>
            <p className="text-[13.5px] text-muted-foreground">
              Paused campaigns queue nothing and send nothing.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- message */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card>
          <CardHeader>
            <CardTitle>What it says</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* A text message has no subject line, so the field goes away
                entirely rather than sitting there greyed out. */}
            {!isSms ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How is your repair holding up?"
                  maxLength={SUBJECT_MAX_CHARS}
                  required
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="body">Message</Label>
                {isSms ? (
                  <span
                    className={cn(
                      "text-[12.5px] font-semibold tabular-nums",
                      overBudget ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {body.length} / {SMS_MAX_CHARS}
                  </span>
                ) : null}
              </div>

              <Textarea
                id="body"
                name="body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={isSms ? 5 : 14}
                maxLength={BODY_MAX_CHARS}
                placeholder="Hi {{firstName}}, …"
                required
                className={cn(
                  "leading-relaxed",
                  overBudget && "border-destructive focus-visible:border-destructive",
                )}
              />

              {overBudget ? (
                <p className="text-[13.5px] font-medium text-destructive">
                  Longer than a text can carry — anything past {SMS_MAX_CHARS}{" "}
                  characters is trimmed before it goes out.
                </p>
              ) : null}

              {/* Placeholder chips — click inserts at the caret. */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Insert
                </span>
                {PLACEHOLDERS.map((placeholder) => {
                  const carried =
                    placeholder.triggers === "all" ||
                    placeholder.triggers.includes(trigger);
                  return (
                    <button
                      key={placeholder.token}
                      type="button"
                      onClick={() => insertToken(placeholder.token)}
                      title={
                        carried
                          ? `Inserts {{${placeholder.token}}}`
                          : `This trigger carries no ${placeholder.label.toLowerCase()} — it renders as nothing.`
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[12.5px] font-medium leading-none transition-colors",
                        "hover:bg-accent-soft hover:text-accent-soft-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        carried ? "text-muted-foreground" : "text-faint-foreground",
                      )}
                    >
                      <span className="font-mono">{`{{${placeholder.token}}}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------- preview */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Eye className="size-4 text-muted-foreground" />
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
              {isSms ? <MessageSquare className="size-4" /> : <Mail className="size-4" />}
              {isSms ? "Text to Alex" : "Email to Alex"}
            </div>

            <div className="rounded-md border border-border bg-surface-hover/60 px-4 py-3.5">
              {!isSms && previewSubject ? (
                <p className="mb-2.5 border-b border-border pb-2.5 text-[15px] font-bold leading-snug text-foreground">
                  {previewSubject}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                {previewBody || "Your message will appear here as you write it."}
              </p>
            </div>

            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Sample values shown. The real message uses the customer&rsquo;s own
              name and the ticket or invoice that triggered it, and{" "}
              {isSms ? "a text" : "an email"} is wrapped in your shop&rsquo;s
              branding on the way out.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="lg" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton size="lg" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
