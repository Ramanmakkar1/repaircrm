"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { updateCheckinAction, updateReviewsAction } from "@/app/(app)/settings/actions";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { ICONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/cn";
import { SaveBar, type SaveBarState } from "./save-bar";
import { ShareLinkActions } from "./share-link";
import { Switch } from "./settings-switch";
import {
  CHECKIN_FIELD_LABEL,
  CHECKIN_OPTIONAL_FIELDS,
  renderReviewMessage,
  type CheckinSettings,
  type ReviewSettings,
} from "./checkin-meta";

/**
 * The front-counter screen: the page customers book their own device in on,
 * and the review request that goes out after they collect it.
 *
 * Two cards, ONE Save pinned to the bottom for both (it sends only the card
 * that changed). The link is buttons (Copy link, Show QR code, Print sign),
 * never an address to select by hand. The review message shows as the text
 * the customer will actually read, with their name and the link filled in.
 */

const CheckinIcon = ICONS.checkin;
const ReviewIcon = ICONS.review;

export type CheckinTabConfig = {
  checkin: CheckinSettings;
  reviews: ReviewSettings;
  /** Public check-in URL, already absolute. */
  checkinUrl: string;
  kioskUrl: string;
  /** PNG data URL of the check-in link, rendered on the server. */
  qrDataUrl: string;
  /** Review requests sent so far this calendar month (on the shop's calendar). */
  reviewsSentThisMonth: number;
  /** For the review message preview. */
  shopName?: string;
};

/** "Wait" choices, in hours after pickup. Any other stored value still shows as its own choice. */
export const REVIEW_WAIT_CHOICES: readonly { hours: number; label: string }[] = [
  { hours: 2, label: "2 hours" },
  { hours: 24, label: "Next day" },
  { hours: 48, label: "2 days" },
  { hours: 168, label: "1 week" },
];

export function waitLabel(hours: number): string {
  const known = REVIEW_WAIT_CHOICES.find((choice) => choice.hours === hours);
  if (known) return known.label;
  if (hours === 0) return "Straight away";
  if (hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

type Saved = { checkin: CheckinSettings; reviews: ReviewSettings };

const sameCheckin = (a: CheckinSettings, b: CheckinSettings) =>
  a.enabled === b.enabled && a.terms === b.terms && CHECKIN_OPTIONAL_FIELDS.every((key) => a.fields[key] === b.fields[key]);

const sameReviews = (a: ReviewSettings, b: ReviewSettings) =>
  a.enabled === b.enabled && a.url === b.url && a.delayHours === b.delayHours && a.template === b.template;

export function CheckinTab({ config }: { config: CheckinTabConfig }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState<Saved>({ checkin: config.checkin, reviews: config.reviews });
  const [checkin, setCheckin] = React.useState(config.checkin);
  const [reviews, setReviews] = React.useState(config.reviews);
  const [busy, setBusy] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const checkinDirty = !sameCheckin(checkin, saved.checkin);
  const reviewsDirty = !sameReviews(reviews, saved.reviews);
  const dirty = checkinDirty || reviewsDirty;

  function editCheckin(patch: Partial<CheckinSettings>) {
    setCheckin((current) => ({ ...current, ...patch }));
    setJustSaved(false);
    setProblem(null);
  }
  function editReviews(patch: Partial<ReviewSettings>) {
    setReviews((current) => ({ ...current, ...patch }));
    setJustSaved(false);
    setProblem(null);
  }

  async function save() {
    if (!dirty) {
      setJustSaved(true);
      return;
    }
    setBusy(true);
    setProblem(null);
    let next = saved;
    if (checkinDirty) {
      const result = await updateCheckinAction({ enabled: checkin.enabled, terms: checkin.terms, fields: checkin.fields });
      if (!result.ok) {
        setBusy(false);
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      next = { ...next, checkin };
    }
    if (reviewsDirty) {
      const result = await updateReviewsAction({ enabled: reviews.enabled, url: reviews.url, delayHours: reviews.delayHours, template: reviews.template });
      if (!result.ok) {
        setSaved(next);
        setBusy(false);
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      next = { ...next, reviews };
    }
    setSaved(next);
    setBusy(false);
    setJustSaved(true);
    toast.success("Saved.");
    router.refresh();
  }

  function undo() {
    setCheckin(saved.checkin);
    setReviews(saved.reviews);
    setProblem(null);
  }

  const state: SaveBarState = busy ? "saving" : dirty ? "dirty" : justSaved ? "saved" : "clean";
  const shopName = config.shopName || "our shop";
  const preview = renderReviewMessage(reviews.template, {
    customer: "Sam",
    shop: shopName,
    link: reviews.url.trim() || "(your review link)",
  });

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------ check-in */}
      <Card>
        <CardHeader
          icon={CheckinIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Customer check-in
              <StatusPill tone={checkin.enabled ? "success" : "neutral"} label={checkin.enabled ? "On" : "Off"} />
            </span>
          }
          description="A page customers fill in on their own phone, or on a tablet by the door. Each one becomes a customer, a device and a repair."
        />

        <CardContent className="flex flex-col gap-6">
          <label className="flex items-center justify-between gap-6">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold text-foreground">
                Let customers check their own device in
              </span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">
                {checkin.enabled
                  ? "The page is open. Put the QR code on the counter."
                  : "The page is closed: anyone opening the link sees nothing."}
              </span>
            </span>
            <Switch
              checked={checkin.enabled}
              onCheckedChange={(enabled) => editCheckin({ enabled })}
              words
              aria-label="Customer check-in page is on"
            />
          </label>

          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-hover p-4">
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">The check-in page</span>
              <ShareLinkActions
                url={config.checkinUrl}
                qrDataUrl={config.qrDataUrl}
                linkName="check-in link"
                signTitle="Check in your device here"
                signLine="Scan with your phone camera to tell us what's wrong. It takes a minute."
                fileName="check-in-qr.png"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">On a tablet by the door (kiosk)</span>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                Bigger buttons, no links off the page, and it clears itself for the next person.
              </p>
              <ShareLinkActions
                url={config.kioskUrl}
                qrDataUrl=""
                linkName="kiosk link"
                signTitle="Check in your device here"
                signLine=""
                fileName="kiosk.png"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">Extra questions on the page</span>
            <div className="flex flex-wrap gap-2">
              {CHECKIN_OPTIONAL_FIELDS.map((key) => (
                <FieldToggle
                  key={key}
                  label={CHECKIN_FIELD_LABEL[key]}
                  active={checkin.fields[key]}
                  onToggle={() => editCheckin({ fields: { ...checkin.fields, [key]: !checkin.fields[key] } })}
                />
              ))}
            </div>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Name, device, problem and a description are always asked. Tap a box to ask or skip the others.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkin-terms" className="text-[15px]">Terms the customer agrees to</Label>
            <Textarea
              id="checkin-terms"
              rows={6}
              maxLength={5000}
              value={checkin.terms}
              onChange={(event) => editCheckin({ terms: event.target.value })}
              className="text-base"
            />
            <p className="text-[14px] text-muted-foreground">
              They tick a box and sign on screen. The signature is kept on the repair and printed on the work order.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- reviews */}
      <Card>
        <CardHeader
          icon={ReviewIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Ask for reviews
              <StatusPill tone={reviews.enabled ? "success" : "neutral"} label={reviews.enabled ? "On" : "Off"} />
            </span>
          }
          description="A short message after a customer collects their device, asking for a review. It goes out by itself."
        />

        <CardContent className="flex flex-col gap-6">
          <label className="flex items-center justify-between gap-6">
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold text-foreground">
                Ask for a review after pickup
              </span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">
                {config.reviewsSentThisMonth === 0
                  ? "None sent this month yet."
                  : `${config.reviewsSentThisMonth} sent this month.`}
              </span>
            </span>
            <Switch
              checked={reviews.enabled}
              onCheckedChange={(enabled) => editReviews({ enabled })}
              words
              aria-label="Review requests are on"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-url" className="text-[15px]">Your review link</Label>
            <Input
              id="review-url"
              value={reviews.url}
              maxLength={500}
              inputMode="url"
              placeholder="https://g.page/r/…/review"
              onChange={(event) => editReviews({ url: event.target.value })}
              className="h-12 text-base"
            />
            <p className="text-[14px] text-muted-foreground">
              Your Google review link, or wherever you collect reviews.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span id="review-wait" className="text-[15px] font-semibold">When to send it</span>
            <div role="radiogroup" aria-labelledby="review-wait" className="flex flex-wrap gap-2">
              {(REVIEW_WAIT_CHOICES.some((choice) => choice.hours === reviews.delayHours)
                ? REVIEW_WAIT_CHOICES
                : [{ hours: reviews.delayHours, label: waitLabel(reviews.delayHours) }, ...REVIEW_WAIT_CHOICES]
              ).map((choice) => {
                const chosen = choice.hours === reviews.delayHours;
                return (
                  <button
                    key={choice.hours}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => editReviews({ delayHours: choice.hours })}
                    className={cn(
                      "inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      chosen ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
                    )}
                  >
                    {chosen ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[14px] text-muted-foreground">After the device is picked up.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-template" className="text-[15px]">The message</Label>
            <Textarea
              id="review-template"
              rows={4}
              maxLength={1000}
              value={reviews.template}
              onChange={(event) => editReviews({ template: event.target.value })}
              className="text-base"
            />
            <p className="text-[14px] text-muted-foreground">
              Words in curly brackets are filled in for you: the customer&rsquo;s name, your shop&rsquo;s name and the review link. Keep the link one.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[13px] font-semibold text-muted-foreground">What the customer gets</span>
              <p className="max-w-prose whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface-hover px-4 py-3 text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {preview}
              </p>
              <span className="text-[13px] text-muted-foreground">
                Texted to customers who said yes to texts, emailed to everyone else.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <SaveBar
        state={state}
        onSave={save}
        onDiscard={undo}
        message={problem}
      />
    </div>
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
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-accent bg-accent-soft text-accent-soft-foreground" : "border-border bg-surface text-muted-foreground hover:border-ring",
      )}
    >
      {active ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
      {label}
      <span className="font-medium">{active ? "· Asked" : "· Skipped"}</span>
    </button>
  );
}
