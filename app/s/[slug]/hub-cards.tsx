"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

import { BIG_INPUT, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HubCardKey } from "@/components/settings/hub-meta";
import { telHref } from "@/lib/portal-display";

/**
 * The shop page's choices, as picture boxes, the way the shop's own Home is
 * built. A box opens its own plain screen with one big button (no accordions),
 * and each screen has an address (#status, #booking, #quote, #pay), so the
 * phone's Back button goes back to the boxes and a link can open one directly.
 *
 * Only "Check in a device" leaves the page, because the check-in desk is its
 * own step-by-step screen.
 *
 * The two lookup forms both end on the SAME sentence no matter what happened
 * server-side. That is not vagueness, it is the whole security property: see
 * app/api/hub/lookup/route.ts.
 */

const LOOKUP_DONE =
  "If those details match a repair with us, we have just sent a link to the email or phone number on file. It works for the next 24 hours.";

const LEAD_DONE = "Thanks, that is with the shop now. We will be in touch soon.";

type CardConfig = Record<HubCardKey, boolean>;

const VIEWS: Record<HubCardKey, { title: string; blurb: string; photo: string }> = {
  status: {
    title: "Check my repair",
    blurb: "We email or text you a link to your repair. No password needed.",
    photo: "/images/home/pickup-bag.webp",
  },
  booking: {
    title: "Book a visit",
    blurb: "Tell us when suits you and we will confirm the time.",
    photo: "/images/home/diary.webp",
  },
  quote: {
    title: "Get a price",
    blurb: "Tell us what is wrong and we will come back with a price.",
    photo: "/images/home/price-tag.webp",
  },
  pay: {
    title: "Pay a bill",
    blurb: "We email you your invoice with a Pay button on it.",
    photo: "/images/home/card-terminal.webp",
  },
};

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const readHash = () => window.location.hash.slice(1);
const noHash = () => "";

export function HubCards({
  slug,
  shopName,
  shopPhone,
  checkinEnabled,
  cards,
  embed,
}: {
  slug: string;
  shopName: string;
  shopPhone: string | null;
  checkinEnabled: boolean;
  cards: CardConfig;
  embed: boolean;
}) {
  const hash = React.useSyncExternalStore(subscribe, readHash, noHash);
  const view = (Object.keys(VIEWS) as HubCardKey[]).find((key) => key === hash && cards[key]) ?? null;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const fromBoxes = React.useRef(false);

  // A newly opened screen starts at its top (the boxes can be a long way up on a phone).
  React.useEffect(() => {
    if (view) rootRef.current?.scrollIntoView({ block: "start" });
  }, [view]);

  /*
   * Embedded mode: tell the host page how tall we are, so the inline widget can
   * grow with an opened form instead of scrolling inside a fixed box.
   *
   * The measurement is the CONTENT root, not `documentElement.scrollHeight`:
   * the document always fills the frame it is in, so measuring the document
   * would only ever report the height we were already given.
   *
   * The message carries a single number and is sent with targetOrigin "*"
   * because we do not know (and should not need to know) which of the shop's
   * domains the snippet was pasted on: a height is not worth protecting.
   */
  React.useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window) return;

    const root = document.getElementById("rf-hub-root");
    if (!root) return;

    const post = () => {
      window.parent.postMessage({ type: "repairpilot:size", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
    };
    post();

    const observer = new ResizeObserver(post);
    observer.observe(root);
    return () => observer.disconnect();
  }, [embed]);

  function backToBoxes() {
    if (fromBoxes.current) {
      fromBoxes.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const anything = checkinEnabled || cards.status || cards.booking || cards.quote || cards.pay;

  if (view) {
    const meta = VIEWS[view];
    return (
      <div ref={rootRef} className="flex scroll-mt-4 flex-col gap-5">
        <button
          type="button"
          onClick={backToBoxes}
          className="-ml-1 inline-flex min-h-12 items-center gap-2 self-start rounded-xl px-1 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-5" />
          All options
        </button>
        <div className="flex items-center gap-4">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-white">
            <Image src={meta.photo} alt="" fill sizes="80px" className="object-contain p-1.5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">{meta.title}</h1>
            <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
          {view === "status" ? <LookupForm slug={slug} intent="status" /> : null}
          {view === "booking" ? <BookingForm slug={slug} /> : null}
          {view === "quote" ? <QuoteForm slug={slug} /> : null}
          {view === "pay" ? <LookupForm slug={slug} intent="pay" /> : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">How can we help?</h1>
      {anything ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {checkinEnabled ? (
            <li>
              <HubTile
                href={`/checkin/${slug}`}
                // Inside the embed the check-in desk has to break out of the
                // widget, or the customer signs their intake in a 380px box.
                target={embed ? "_blank" : undefined}
                photo="/images/home/toolbox.webp"
                title="Check in a device"
                detail="Leave it with us. About a minute."
              />
            </li>
          ) : null}
          {(Object.keys(VIEWS) as HubCardKey[])
            .filter((key) => cards[key])
            .map((key) => (
              <li key={key}>
                <HubTile
                  href={`#${key}`}
                  photo={VIEWS[key].photo}
                  title={VIEWS[key].title}
                  detail={VIEWS[key].blurb}
                  onOpen={() => {
                    fromBoxes.current = true;
                  }}
                />
              </li>
            ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-[15px] leading-relaxed text-muted-foreground">
          {shopName} has not switched anything on here yet.{" "}
          {shopPhone ? (
            <a href={telHref(shopPhone)} className="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4">
              Call {shopPhone}
            </a>
          ) : null}
        </p>
      )}
    </div>
  );
}

/**
 * A picture box: the photo on its white canvas, a plain name, one line. The
 * same shape as the shop's Home tiles (components/counter/picture-tile.tsx),
 * but a plain anchor so an in-page #view is a real browser navigation (it
 * fires hashchange and gives the phone's Back button something to go back to).
 */
function HubTile({
  href,
  target,
  photo,
  title,
  detail,
  onOpen,
}: {
  href: string;
  target?: string;
  photo: string;
  title: string;
  detail: string;
  onOpen?: () => void;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target ? "noreferrer" : undefined}
      onClick={onOpen}
      className={cn(
        "group relative flex h-full min-h-44 flex-col overflow-hidden rounded-2xl border border-border bg-surface",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="relative block aspect-[4/3] w-full bg-white">
        <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, 220px" className="object-contain p-3" />
      </span>
      <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <span className="text-base font-semibold leading-tight sm:text-lg">{title}</span>
        <span className="text-[13px] leading-snug text-muted-foreground sm:text-sm">{detail}</span>
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Shared form bits
// ---------------------------------------------------------------------------

/**
 * The honeypot every public form in Repairs helper carries. Positioned off screen
 * rather than `display:none` because some bots skip hidden inputs, with
 * `tabindex="-1"` and `aria-hidden` to keep it away from keyboards and screen
 * readers. Both endpoints answer success when it is filled.
 */
function Honeypot() {
  return <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px]" />;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[15px]">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[14px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 className="size-12 text-status-resolved" aria-hidden />
      <p className="max-w-md text-[17px] leading-relaxed">{children}</p>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-[15px] font-medium leading-relaxed text-destructive">
      {children}
    </p>
  );
}

function SendButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={busy} className={HUGE_BUTTON}>
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {busy ? "Sending…" : children}
    </Button>
  );
}

/** Posts a plain object as JSON and reports whether the server accepted it. */
async function post(url: string, body: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };

    const data = await response.json().catch(() => null);
    const error =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "That did not go through. Please try again, or give us a call.";
    return { ok: false, error };
  } catch {
    return { ok: false, error: "No connection. Please try again in a moment." };
  }
}

// ---------------------------------------------------------------------------
// Status / pay lookup
// ---------------------------------------------------------------------------

function LookupForm({ slug, intent }: { slug: string; intent: "status" | "pay" }) {
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (sent) return <Done>{LOOKUP_DONE}</Done>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await post("/api/hub/lookup", {
      shop: slug,
      intent,
      reference: String(form.get("reference") ?? ""),
      contact: String(form.get("contact") ?? ""),
      website: String(form.get("website") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-4">
      <Honeypot />
      {error ? <Problem>{error}</Problem> : null}

      <Field
        id={`${intent}-reference`}
        label={intent === "pay" ? "Invoice or repair number" : "Repair number"}
        hint="It is on your receipt, or in the message we sent you."
      >
        <Input
          id={`${intent}-reference`}
          name="reference"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={20}
          placeholder="1042"
          className={BIG_INPUT}
        />
      </Field>

      <Field id={`${intent}-contact`} label="Email or phone you gave us" hint="We send the link there, never to an address typed here.">
        <Input
          id={`${intent}-contact`}
          name="contact"
          autoComplete="email"
          required
          maxLength={160}
          placeholder="you@example.com or (512) 555-0142"
          className={BIG_INPUT}
        />
      </Field>

      <SendButton busy={busy}>{intent === "pay" ? "Send me my invoice" : "Send me my repair link"}</SendButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Booking / quote: both are Leads, through the same public endpoint the
// website form snippet has always used.
// ---------------------------------------------------------------------------

function ContactFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field id={`${prefix}-name`} label="Your name">
        <Input id={`${prefix}-name`} name="name" required maxLength={120} autoComplete="name" className={BIG_INPUT} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-phone`} label="Phone">
          <Input id={`${prefix}-phone`} name="phone" type="tel" inputMode="tel" maxLength={40} autoComplete="tel" className={BIG_INPUT} />
        </Field>
        <Field id={`${prefix}-email`} label="Email">
          <Input id={`${prefix}-email`} name="email" type="email" inputMode="email" maxLength={160} autoComplete="email" className={BIG_INPUT} />
        </Field>
      </div>
    </>
  );
}

function BookingForm({ slug }: { slug: string }) {
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (sent) return <Done>Thanks, we will confirm your time soon.</Done>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") ?? "").trim();
    const time = String(form.get("time") ?? "").trim();
    const details = String(form.get("details") ?? "").trim();

    setBusy(true);
    const result = await post("/api/leads", {
      shop: slug,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      // The preferred slot rides in the note rather than in a schema change: a
      // request is not an appointment until the shop says it is, and the shop
      // books the real one from the enquiry.
      message: [date ? `Preferred day: ${date}${time ? ` (${time})` : ""}` : null, details || null].filter(Boolean).join("\n\n"),
      source: "Appointment request",
      website: String(form.get("website") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-4">
      <Honeypot />
      {error ? <Problem>{error}</Problem> : null}

      <ContactFields prefix="booking" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="booking-date" label="Which day suits you?">
          <Input id="booking-date" name="date" type="date" className={BIG_INPUT} />
        </Field>
        <Field id="booking-time" label="Time of day">
          <select
            id="booking-time"
            name="time"
            defaultValue=""
            className="h-12 w-full rounded-xl border border-border-strong bg-surface px-4 text-base text-foreground outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Any time</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Late afternoon">Late afternoon</option>
          </select>
        </Field>
      </div>

      <Field id="booking-details" label="What needs looking at?">
        <Textarea id="booking-details" name="details" rows={3} maxLength={2000} className="rounded-xl px-4 py-3 text-base" />
      </Field>

      <p className="text-[14px] text-muted-foreground">Leave a phone number or an email so we can confirm.</p>

      <SendButton busy={busy}>Ask for this time</SendButton>
    </form>
  );
}

function QuoteForm({ slug }: { slug: string }) {
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (sent) return <Done>{LEAD_DONE}</Done>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await post("/api/leads", {
      shop: slug,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      message: String(form.get("message") ?? ""),
      source: "Website",
      website: String(form.get("website") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-4">
      <Honeypot />
      {error ? <Problem>{error}</Problem> : null}

      <ContactFields prefix="quote" />

      <Field id="quote-message" label="What is wrong, and with what?">
        <Textarea
          id="quote-message"
          name="message"
          rows={4}
          maxLength={4000}
          placeholder="iPhone 13, cracked screen. How much and how long?"
          className="rounded-xl px-4 py-3 text-base"
        />
      </Field>

      <p className="text-[14px] text-muted-foreground">Leave a phone number or an email so we can reply.</p>

      <SendButton busy={busy}>Send my question</SendButton>
    </form>
  );
}
