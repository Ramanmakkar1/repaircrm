"use client";

import * as React from "react";
import SignatureCanvas from "react-signature-canvas";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CheckinFieldKey } from "@/components/settings/checkin-meta";
import { CHECKIN_FIELD_HINT, CHECKIN_FIELD_LABEL } from "@/components/settings/checkin-meta";
import { submitCheckinAction } from "./actions";

/**
 * The form a walk-in fills in on their own phone, or on the tablet by the door.
 *
 * It is one long single column with big targets and no jargon: the person
 * filling it in is holding a broken laptop, not reading a manual. Kiosk mode
 * scales the type and the controls up, drops every link off the page, and
 * returns to a blank form eight seconds after a successful check-in so the next
 * person in the queue is not looking at somebody else's ticket number.
 */

const KIOSK_RESET_MS = 8000;

export function CheckinForm({
  slug,
  shopName,
  shopPhone,
  deviceTypes,
  problemTypes,
  terms,
  fields,
  kiosk,
}: {
  slug: string;
  shopName: string;
  shopPhone: string | null;
  deviceTypes: string[];
  problemTypes: string[];
  terms: string;
  fields: Record<CheckinFieldKey, boolean>;
  kiosk: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [ticketNumber, setTicketNumber] = React.useState<number | null>(null);
  const [signature, setSignature] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);

  const formRef = React.useRef<HTMLFormElement | null>(null);
  const padRef = React.useRef<SignatureCanvas | null>(null);

  const reset = React.useCallback(() => {
    setTicketNumber(null);
    setError(null);
    setSignature("");
    setAccepted(false);
    padRef.current?.clear();
    formRef.current?.reset();
  }, []);

  // Kiosk only: hand the tablet back to the queue on its own.
  React.useEffect(() => {
    if (!kiosk || ticketNumber === null) return;
    const timer = window.setTimeout(reset, KIOSK_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [kiosk, ticketNumber, reset]);

  async function submit(formData: FormData) {
    setBusy(true);
    formData.set("signature", signature);
    const result = await submitCheckinAction(slug, formData);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setTicketNumber(result.ticketNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (ticketNumber !== null) {
    return (
      <Shell shopName={shopName} shopPhone={shopPhone} kiosk={kiosk}>
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
          <span className="flex size-16 items-center justify-center rounded-full bg-status-resolved-bg">
            <CheckCircle2 className="size-8 text-status-resolved-fg" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight">You&rsquo;re checked in</h2>
            <p className="text-[15px] text-muted-foreground">
              Keep this number handy — it&rsquo;s how we&rsquo;ll find your device.
            </p>
          </div>
          <div className="rounded-xl bg-accent-soft px-8 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-soft-foreground">
              Your ticket
            </div>
            <div className="font-mono text-4xl font-bold tabular-nums text-accent-soft-foreground">
              #{ticketNumber}
            </div>
          </div>
          <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">
            We&rsquo;ve sent a confirmation with a link you can use to follow the
            repair. {shopName} will be in touch before any chargeable work starts.
          </p>
          <Button variant="outline" size="lg" onClick={reset}>
            Check in another device
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell shopName={shopName} shopPhone={shopPhone} kiosk={kiosk}>
      <form
        ref={formRef}
        action={submit}
        className={cn("flex flex-col", kiosk ? "gap-7" : "gap-6")}
      >
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Honeypot: off-screen, not `display:none`, so bots that skip hidden
            inputs still fill it in. Never shown to a person. */}
        <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Section title="About you" kiosk={kiosk}>
          <Row>
            <FieldBox label="Your name" htmlFor="name" required kiosk={kiosk}>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                autoComplete="name"
                placeholder="Ada Lovelace"
                className={kiosk ? "h-14 text-base" : undefined}
              />
            </FieldBox>
          </Row>
          <Row>
            <FieldBox
              label="Email"
              htmlFor="email"
              hint="We'll send your ticket link here."
              kiosk={kiosk}
            >
              <Input
                id="email"
                name="email"
                type="email"
                maxLength={160}
                autoComplete="email"
                placeholder="you@example.com"
                className={kiosk ? "h-14 text-base" : undefined}
              />
            </FieldBox>
            <FieldBox
              label="Mobile"
              htmlFor="phone"
              hint="Either one is fine — we need one way to reach you."
              kiosk={kiosk}
            >
              <Input
                id="phone"
                name="phone"
                type="tel"
                maxLength={40}
                autoComplete="tel"
                placeholder="(512) 555-0142"
                className={kiosk ? "h-14 text-base" : undefined}
              />
            </FieldBox>
          </Row>
        </Section>

        <Section title="The device" kiosk={kiosk}>
          <Row>
            <FieldBox label="What is it?" htmlFor="deviceType" required kiosk={kiosk}>
              <Input
                id="deviceType"
                name="deviceType"
                required
                maxLength={60}
                list="rf-device-types"
                placeholder="Laptop, phone, tablet…"
                className={kiosk ? "h-14 text-base" : undefined}
              />
              <datalist id="rf-device-types">
                {deviceTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </FieldBox>
            {fields.make ? (
              <FieldBox
                label={CHECKIN_FIELD_LABEL.make}
                htmlFor="make"
                hint={CHECKIN_FIELD_HINT.make}
                kiosk={kiosk}
              >
                <Input
                  id="make"
                  name="make"
                  maxLength={60}
                  className={kiosk ? "h-14 text-base" : undefined}
                />
              </FieldBox>
            ) : null}
          </Row>
          <Row>
            {fields.model ? (
              <FieldBox
                label={CHECKIN_FIELD_LABEL.model}
                htmlFor="model"
                hint={CHECKIN_FIELD_HINT.model}
                kiosk={kiosk}
              >
                <Input
                  id="model"
                  name="model"
                  maxLength={60}
                  className={kiosk ? "h-14 text-base" : undefined}
                />
              </FieldBox>
            ) : null}
            {fields.serial ? (
              <FieldBox
                label={CHECKIN_FIELD_LABEL.serial}
                htmlFor="serial"
                hint={CHECKIN_FIELD_HINT.serial}
                kiosk={kiosk}
              >
                <Input
                  id="serial"
                  name="serial"
                  maxLength={80}
                  className={kiosk ? "h-14 text-base" : undefined}
                />
              </FieldBox>
            ) : null}
          </Row>
          {fields.unlockCode ? (
            <Row>
              <FieldBox
                label={CHECKIN_FIELD_LABEL.unlockCode}
                htmlFor="unlockCode"
                hint={CHECKIN_FIELD_HINT.unlockCode}
                kiosk={kiosk}
              >
                <Input
                  id="unlockCode"
                  name="unlockCode"
                  maxLength={60}
                  autoComplete="off"
                  className={kiosk ? "h-14 text-base" : undefined}
                />
              </FieldBox>
            </Row>
          ) : null}
        </Section>

        <Section title="What's wrong?" kiosk={kiosk}>
          <FieldBox label="Type of job" htmlFor="problemType" required kiosk={kiosk}>
            {/* A native select, not the Radix one: this page is used on tablets
                and old phones, where the OS picker is faster and never traps
                focus. */}
            <select
              id="problemType"
              name="problemType"
              required
              defaultValue=""
              className={cn(
                "w-full rounded-md border border-border-strong bg-surface px-3.5 text-sm text-foreground shadow-xs outline-none transition-colors",
                "focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20",
                kiosk ? "h-14 text-base" : "h-10",
              )}
            >
              <option value="" disabled>
                Choose one…
              </option>
              {problemTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FieldBox>

          <FieldBox
            label="Tell us what's happening"
            htmlFor="description"
            required
            hint="When it started, what you've already tried, anything we should know."
            kiosk={kiosk}
          >
            <Textarea
              id="description"
              name="description"
              required
              rows={kiosk ? 6 : 5}
              maxLength={4000}
              placeholder="Screen cracked after a drop. It still turns on but the bottom third is black."
              className={kiosk ? "text-base" : undefined}
            />
          </FieldBox>
        </Section>

        <Section title="Terms" kiosk={kiosk}>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-4 py-3.5 text-[14px] leading-relaxed text-muted-foreground">
            {terms}
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={accepted}
              onCheckedChange={(value) => setAccepted(value === true)}
              className={kiosk ? "mt-0.5 size-6" : "mt-0.5"}
            />
            <input type="hidden" name="terms" value={accepted ? "on" : ""} />
            <span className={cn("font-medium", kiosk ? "text-[16px]" : "text-[14.5px]")}>
              I&rsquo;ve read and accept the terms above.
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
              Signature
            </span>
            {/* Always white paper with a dark pen: this image is reprinted on
                the work order, and a signature drawn in white would vanish. */}
            <div className="rounded-lg border border-border-strong bg-white p-2 shadow-sm">
              <SignatureCanvas
                ref={padRef}
                penColor="#1c1a17"
                onEnd={() => {
                  const pad = padRef.current;
                  setDataUrl(pad, setSignature);
                }}
                canvasProps={{
                  className: cn(
                    "block w-full touch-none rounded-sm",
                    kiosk ? "h-[220px]" : "h-[170px]",
                  ),
                  "aria-label": "Signature pad",
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted-foreground">
                Sign with a finger, a stylus or a mouse.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  padRef.current?.clear();
                  setSignature("");
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </Section>

        <Button
          type="submit"
          size="lg"
          disabled={busy || !accepted || signature === ""}
          className={kiosk ? "h-16 text-lg" : undefined}
        >
          {busy ? "Checking in…" : "Check in my device"}
        </Button>
      </form>
    </Shell>
  );
}

/** Reads the pad into state, or clears it when the customer wiped the canvas. */
function setDataUrl(
  pad: SignatureCanvas | null,
  set: (value: string) => void,
): void {
  if (!pad || pad.isEmpty()) {
    set("");
    return;
  }
  set(pad.toDataURL("image/png"));
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function Shell({
  shopName,
  shopPhone,
  kiosk,
  children,
}: {
  shopName: string;
  shopPhone: string | null;
  kiosk: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-2xl px-5 py-5">
          <div className={cn("font-bold tracking-tight", kiosk ? "text-2xl" : "text-xl")}>
            {shopName}
          </div>
          <div className="text-[13.5px] text-muted-foreground">
            Check in a device — it takes about a minute.
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-10">{children}</main>

      {/* Kiosk mode deliberately has no footer contact line: the tablet is
          already standing in the shop, and a phone number invites a customer to
          wander off to call it. */}
      {kiosk ? null : (
        <footer className="mx-auto max-w-2xl px-5 pb-10 text-center text-[13px] text-muted-foreground">
          Rather do this at the counter? Come in and see us
          {shopPhone ? `, or call ${shopPhone}` : ""}.
        </footer>
      )}
    </div>
  );
}

function Section({
  title,
  kiosk,
  children,
}: {
  title: string;
  kiosk: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-5 shadow-sm sm:px-6">
      <h2 className={cn("font-bold tracking-tight", kiosk ? "text-xl" : "text-[17px]")}>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function FieldBox({
  label,
  htmlFor,
  hint,
  required,
  kiosk,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  kiosk: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className={kiosk ? "text-[15px]" : undefined}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {hint ? (
        <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
