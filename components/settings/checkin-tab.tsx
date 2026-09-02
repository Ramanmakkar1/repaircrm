"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateCheckinAction, updateReviewsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKIN_FIELD_LABEL,
  CHECKIN_OPTIONAL_FIELDS,
  REVIEW_TOKENS,
  type CheckinSettings,
  type ReviewSettings,
} from "./checkin-meta";

/**
 * The front-counter tab: the public check-in form, and the review ask that goes
 * out after a customer collects their device.
 *
 * Two cards because they are two decisions a shop makes at different times —
 * "can people book their own device in?" and "do we chase reviews?" — and each
 * saves on its own. Neither is destructive, so neither hides behind a confirm.
 */

const CheckinIcon = ICONS.checkin;
const ReviewIcon = ICONS.review;
const SaveIcon = ACTIONS.save;
const CopyIcon = ACTIONS.copy;
const OpenIcon = ACTIONS.openExternal;

export type CheckinTabConfig = {
  checkin: CheckinSettings;
  reviews: ReviewSettings;
  /** Public check-in URL, already absolute. */
  checkinUrl: string;
  kioskUrl: string;
  /** PNG data URL of the check-in link, rendered on the server. */
  qrDataUrl: string;
  /** Review requests sent so far this calendar month. */
  reviewsSentThisMonth: number;
};

export function CheckinTab({ config }: { config: CheckinTabConfig }) {
  return (
    <div className="flex flex-col gap-5">
      <CheckinCard config={config} />
      <ReviewsCard
        reviews={config.reviews}
        sentThisMonth={config.reviewsSentThisMonth}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

function CheckinCard({ config }: { config: CheckinTabConfig }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(config.checkin.enabled);
  const [terms, setTerms] = React.useState(config.checkin.terms);
  const [fields, setFields] = React.useState(config.checkin.fields);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await updateCheckinAction({ enabled, terms, fields });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Check-in saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        icon={CheckinIcon}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Public check-in
            {/* Follows the switch, not the server, so the header and the row
                below never disagree while an edit is unsaved. */}
            <StatusPill
              size="sm"
              tone={enabled ? "success" : "neutral"}
              label={enabled ? "Live" : "Off"}
            />
          </span>
        }
        description="A page customers can fill in on their own phone, or on a tablet by the door. Every submission creates a customer, a device and a ticket."
      />

      <CardContent className="flex flex-col gap-6">
        <label className="flex items-start justify-between gap-6">
          <span className="flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold text-foreground">
              Let customers book their own device in
            </span>
            <span className="text-[13.5px] leading-relaxed text-muted-foreground">
              While this is off the link below returns a 404 — the same answer a
              shop that has never existed gives.
            </span>
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable public check-in"
          />
        </label>

        {/* ------------------------------------------------------- the link */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-hover px-4 py-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <LinkRow label="Public link" value={config.checkinUrl} openable />
            <LinkRow label="Kiosk link" value={config.kioskUrl} openable />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Kiosk mode scales the form up for a tablet, hides the links off the
              page and clears itself for the next person in the queue.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1.5">
            {/* Rendered on the server into a data URL — no client-side QR
                library ships to the browser for a picture that never changes.
                eslint-disable: next/image cannot optimise a data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.qrDataUrl}
              alt="QR code for the public check-in page"
              className="size-32 rounded-lg border border-border bg-white p-1.5"
            />
            <span className="text-[11.5px] font-medium text-muted-foreground">
              Stick this on the counter
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------- the fields */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
            Optional fields
          </span>
          <div className="flex flex-wrap gap-2">
            {CHECKIN_OPTIONAL_FIELDS.map((key) => (
              <FieldToggle
                key={key}
                label={CHECKIN_FIELD_LABEL[key]}
                active={fields[key]}
                onToggle={() =>
                  setFields((prev) => ({ ...prev, [key]: !prev[key] }))
                }
              />
            ))}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Name, device type, problem and description are always asked for —
            without them there is no ticket worth having.
          </p>
        </div>

        {/* ----------------------------------------------------- the terms */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checkin-terms">Terms shown above the signature</Label>
          <Textarea
            id="checkin-terms"
            rows={6}
            maxLength={5000}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
          />
          <p className="text-[12.5px] text-muted-foreground">
            The customer ticks a box and signs on screen. The signature is saved
            on the ticket and reprinted on the work order.
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <SaveIcon aria-hidden />}
          {busy ? "Saving…" : "Save check-in"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function FieldToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13.5px] font-semibold text-accent-soft-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          : "inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      }
    >
      {active ? <Check className="size-3.5" /> : null}
      {label}
    </button>
  );
}

function LinkRow({
  label,
  value,
  openable,
}: {
  label: string;
  value: string;
  openable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
        {label}
      </span>
      {/* Wraps on a phone: a 390px row cannot hold a URL and two buttons, and
          "http://localhos" is not a link anybody can check. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={value}
          className="h-9 basis-full font-mono text-[12.5px] sm:min-w-0 sm:flex-1 sm:basis-auto"
        />
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <CopyIcon className="size-4" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only">{label}</span>
        </Button>
        {openable ? (
          <Button asChild variant="ghost" size="sm">
            <a href={value} target="_blank" rel="noreferrer">
              <OpenIcon className="size-4" aria-hidden />
              Open
              <span className="sr-only"> {label}</span>
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function ReviewsCard({
  reviews,
  sentThisMonth,
}: {
  reviews: ReviewSettings;
  sentThisMonth: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(reviews.enabled);
  const [url, setUrl] = React.useState(reviews.url);
  const [delay, setDelay] = React.useState(String(reviews.delayHours));
  const [template, setTemplate] = React.useState(reviews.template);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await updateReviewsAction({
      enabled,
      url,
      delayHours: Number.parseInt(delay, 10),
      template,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Review requests saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        icon={ReviewIcon}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Reviews
            <StatusPill
              size="sm"
              tone={enabled ? "success" : "neutral"}
              label={enabled ? "On" : "Off"}
            />
          </span>
        }
        description="Asks for a review once a customer has collected their device and had a little time to use it. Sent automatically by the scheduler — see Settings → Automation."
      />

      <CardContent className="flex flex-col gap-6">
        <label className="flex items-start justify-between gap-6">
          <span className="flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold text-foreground">
              Ask for a review after pickup
            </span>
            <span className="text-[13.5px] leading-relaxed text-muted-foreground">
              {sentThisMonth === 0
                ? "None sent this month yet."
                : `${sentThisMonth} sent this month.`}
            </span>
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable review requests"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-url">Review link</Label>
            <Input
              id="review-url"
              value={url}
              maxLength={500}
              placeholder="https://g.page/r/…/review"
              onChange={(event) => setUrl(event.target.value)}
            />
            <p className="text-[12.5px] text-muted-foreground">
              Your Google review link, or anywhere else you collect them.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-delay">Wait (hours)</Label>
            <Input
              id="review-delay"
              inputMode="numeric"
              value={delay}
              onChange={(event) =>
                setDelay(event.target.value.replace(/[^0-9]/g, ""))
              }
            />
            <p className="text-[12.5px] text-muted-foreground">
              After pickup. 24 is a good default.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-template">Message</Label>
          <Textarea
            id="review-template"
            rows={4}
            maxLength={1000}
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          />
          <p className="text-[12.5px] text-muted-foreground">
            {REVIEW_TOKENS.join(" · ")} are filled in. Texted to customers who
            opted in to SMS, emailed to everyone else.
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <SaveIcon aria-hidden />}
          {busy ? "Saving…" : "Save reviews"}
        </Button>
      </CardFooter>
    </Card>
  );
}
