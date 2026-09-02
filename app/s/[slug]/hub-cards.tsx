"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HubCardKey } from "@/components/settings/hub-meta";

/**
 * The hub's cards.
 *
 * Phone first, and not as a figure of speech: this link is opened from a text
 * message, a receipt and a window sticker far more often than from a desk. So
 * it is one column of large tap targets, each one sentence long, and a card
 * that needs details opens them in place rather than navigating away — a
 * customer who taps "check my repair" and lands on a different page has already
 * lost the ticket number they were about to type.
 *
 * Only "check in a device" leaves the page, because the check-in desk is a long
 * form with a signature pad and belongs on its own screen.
 *
 * The two lookup forms both end on the SAME sentence no matter what happened
 * server-side. That is not vagueness, it is the whole security property: see
 * app/api/hub/lookup/route.ts.
 */

const LOOKUP_DONE =
  "If those details match a repair with us, we've just sent a link to the email or phone number on file. It works for the next 24 hours.";

const LEAD_DONE = "Thanks — that's with the shop now. We'll be in touch shortly.";

type CardConfig = Record<HubCardKey, boolean>;

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
  const [open, setOpen] = React.useState<string | null>(null);

  /*
   * Embedded mode: tell the host page how tall we are, so the inline widget can
   * grow with an opened form instead of scrolling inside a fixed box.
   *
   * The measurement is the CONTENT root, not `documentElement.scrollHeight` —
   * the document always fills the frame it is in, so measuring the document
   * would only ever report the height we were already given.
   *
   * The message carries a single number and is sent with targetOrigin "*"
   * because we do not know (and should not need to know) which of the shop's
   * domains the snippet was pasted on — a height is not worth protecting.
   */
  React.useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window) return;

    const root = document.getElementById("rf-hub-root");
    if (!root) return;

    const post = () => {
      window.parent.postMessage(
        { type: "repairflow:size", height: Math.ceil(root.getBoundingClientRect().height) },
        "*",
      );
    };
    post();

    const observer = new ResizeObserver(post);
    observer.observe(root);
    return () => observer.disconnect();
  }, [embed]);

  const anything =
    checkinEnabled || cards.status || cards.booking || cards.quote || cards.pay;

  return (
    <div className="flex flex-col gap-3">
      {checkinEnabled ? (
        <LinkCard
          icon={ICONS.checkin}
          title="Check in a device"
          blurb="Book your device in before you arrive — takes about a minute."
          href={`/checkin/${slug}`}
          // Inside the embed the check-in desk has to break out of the widget,
          // or the customer signs their intake form in a 380px box.
          target={embed ? "_blank" : undefined}
        />
      ) : null}

      {cards.status ? (
        <ExpandingCard
          id="status"
          icon={ACTIONS.search}
          title="Check my repair status"
          blurb="We'll email you a link to your repair — no password needed."
          open={open === "status"}
          onToggle={setOpen}
        >
          <LookupForm slug={slug} intent="status" />
        </ExpandingCard>
      ) : null}

      {cards.booking ? (
        <ExpandingCard
          id="booking"
          icon={ICONS.appointment}
          title="Book an appointment"
          blurb="Tell us when suits you and we'll confirm the slot."
          open={open === "booking"}
          onToggle={setOpen}
        >
          <BookingForm slug={slug} />
        </ExpandingCard>
      ) : null}

      {cards.quote ? (
        <ExpandingCard
          id="quote"
          icon={ICONS.message}
          title="Get a quote or ask a question"
          blurb="Describe the problem and we'll come back to you with a price."
          open={open === "quote"}
          onToggle={setOpen}
        >
          <QuoteForm slug={slug} />
        </ExpandingCard>
      ) : null}

      {cards.pay ? (
        <ExpandingCard
          id="pay"
          icon={ICONS.payment}
          title="Pay a bill"
          blurb="We'll email your invoice with a Pay button on it."
          open={open === "pay"}
          onToggle={setOpen}
        >
          <LookupForm slug={slug} intent="pay" />
        </ExpandingCard>
      ) : null}

      {!anything ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-[14.5px] leading-relaxed text-muted-foreground shadow-sm">
          {shopName} hasn&rsquo;t switched anything on here yet.
          {shopPhone ? ` Please call ${shopPhone}.` : ""}
        </p>
      ) : null}

      {shopPhone && anything ? (
        <p className="pt-1 text-center text-[13.5px] text-muted-foreground">
          Rather talk to someone?{" "}
          <a
            href={`tel:${shopPhone.replace(/\s+/g, "")}`}
            className="font-semibold text-accent hover:underline"
          >
            Call {shopPhone}
          </a>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card shells
// ---------------------------------------------------------------------------

function CardFace({
  icon: Icon,
  title,
  blurb,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  blurb: string;
  trailing?: React.ReactNode;
}) {
  return (
    <span className="flex w-full items-center gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="text-[16px] font-bold leading-tight tracking-tight text-foreground">
          {title}
        </span>
        <span className="text-[13.5px] leading-snug text-muted-foreground">
          {blurb}
        </span>
      </span>
      {trailing}
    </span>
  );
}

function LinkCard({
  icon,
  title,
  blurb,
  href,
  target,
}: {
  icon: LucideIcon;
  title: string;
  blurb: string;
  href: string;
  target?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target ? "noreferrer" : undefined}
      className="flex items-center rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-5"
    >
      <CardFace
        icon={icon}
        title={title}
        blurb={blurb}
        trailing={
          <ChevronDown className="size-5 shrink-0 -rotate-90 text-faint-foreground" />
        }
      />
    </a>
  );
}

function ExpandingCard({
  id,
  icon,
  title,
  blurb,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  open: boolean;
  onToggle: (next: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface shadow-sm transition-colors",
        open ? "border-border-strong" : "border-border",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`hub-panel-${id}`}
        onClick={() => onToggle(open ? null : id)}
        className="flex w-full items-center rounded-2xl px-4 py-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-5"
      >
        <CardFace
          icon={icon}
          title={title}
          blurb={blurb}
          trailing={
            <ChevronDown
              className={cn(
                "size-5 shrink-0 text-faint-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          }
        />
      </button>

      {open ? (
        <div
          id={`hub-panel-${id}`}
          className="border-t border-border px-4 py-5 sm:px-5"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form bits
// ---------------------------------------------------------------------------

/**
 * The honeypot every public form in RepairFlow carries. Positioned off screen
 * rather than `display:none` because some bots skip hidden inputs, with
 * `tabindex="-1"` and `aria-hidden` to keep it away from keyboards and screen
 * readers. Both endpoints answer success when it is filled.
 */
function Honeypot() {
  return (
    <input
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="absolute left-[-9999px]"
    />
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-[12.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-status-resolved-bg px-4 py-4 text-[14px] leading-relaxed text-status-resolved-fg">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive-soft px-4 py-3 text-[13.5px] font-medium leading-relaxed text-destructive"
    >
      {children}
    </p>
  );
}

/** Posts a plain object as JSON and reports whether the server accepted it. */
async function post(
  url: string,
  body: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
        : "That didn't go through. Please try again, or give us a call.";
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
        label={intent === "pay" ? "Invoice or ticket number" : "Ticket number"}
        hint="It's on the receipt or email we sent you."
      >
        <Input
          id={`${intent}-reference`}
          name="reference"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={20}
          placeholder="1042"
        />
      </Field>

      <Field
        id={`${intent}-contact`}
        label="Email or phone on the repair"
        hint="We send the link there — never to the address typed here."
      >
        <Input
          id={`${intent}-contact`}
          name="contact"
          autoComplete="email"
          required
          maxLength={160}
          placeholder="you@example.com"
        />
      </Field>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? "Sending…" : intent === "pay" ? "Email me my invoice" : "Email me my repair link"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Booking / quote — both are Leads, through the same public endpoint the
// website form snippet has always used.
// ---------------------------------------------------------------------------

function BookingForm({ slug }: { slug: string }) {
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (sent) {
    return <Done>Thanks — we&rsquo;ll confirm your slot shortly.</Done>;
  }

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
      // books the real one from the lead.
      message: [
        date ? `Preferred day: ${date}${time ? ` (${time})` : ""}` : null,
        details || null,
      ]
        .filter(Boolean)
        .join("\n\n"),
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

      <Field id="booking-name" label="Your name">
        <Input id="booking-name" name="name" required maxLength={120} autoComplete="name" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="booking-phone" label="Phone">
          <Input
            id="booking-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
          />
        </Field>
        <Field id="booking-email" label="Email">
          <Input
            id="booking-email"
            name="email"
            type="email"
            maxLength={160}
            autoComplete="email"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="booking-date" label="Preferred day">
          <Input id="booking-date" name="date" type="date" />
        </Field>
        <Field id="booking-time" label="Time of day">
          <select
            id="booking-time"
            name="time"
            defaultValue=""
            className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-[15px] text-foreground outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Any time</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Late afternoon">Late afternoon</option>
          </select>
        </Field>
      </div>

      <Field id="booking-details" label="What needs looking at?">
        <Textarea id="booking-details" name="details" rows={3} maxLength={2000} />
      </Field>

      <p className="text-[12.5px] text-muted-foreground">
        Leave a phone number or an email so we can confirm.
      </p>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? "Sending…" : "Request this appointment"}
      </Button>
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

      <Field id="quote-name" label="Your name">
        <Input id="quote-name" name="name" required maxLength={120} autoComplete="name" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="quote-phone" label="Phone">
          <Input id="quote-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </Field>
        <Field id="quote-email" label="Email">
          <Input
            id="quote-email"
            name="email"
            type="email"
            maxLength={160}
            autoComplete="email"
          />
        </Field>
      </div>

      <Field id="quote-message" label="What can we help with?">
        <Textarea
          id="quote-message"
          name="message"
          rows={4}
          maxLength={4000}
          placeholder="iPhone 13, cracked screen — how much and how long?"
        />
      </Field>

      <p className="text-[12.5px] text-muted-foreground">
        Leave a phone number or an email so we can reply.
      </p>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy ? "Sending…" : "Send my question"}
      </Button>
    </form>
  );
}
