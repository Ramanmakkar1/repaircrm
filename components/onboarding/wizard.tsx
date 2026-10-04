"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Printer, Store } from "lucide-react";
import { toast } from "sonner";

import {
  advanceOnboardingAction,
  createStarterItemsAction,
  finishOnboardingAction,
  inviteTeamAction,
  saveShopBasicsAction,
  type InviteOutcome,
} from "@/app/(app)/setup/actions";
import { StatusPill, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { ROLE_BLURB, ROLE_OPTIONS } from "@/components/settings/types";
import { ShareLinkActions } from "@/components/settings/share-link";
import { Switch } from "@/components/settings/settings-switch";
import { STEPS, stepIndex, stepProgress, stepState, stepWords, type StepKey } from "./steps";

/**
 * The first-run setup, reached straight after signup, built like the New
 * repair check-in: "Step 2 of 5: Your team" in words with a progress bar, a
 * row of the five steps you can tap at any time, one question per screen with
 * a picture, one big button, and a plain "Do this later" beside it.
 *
 * Every step is skippable. A shop owner who signed up at 7pm to see whether
 * this thing works will abandon a wizard that traps them; whatever is still
 * missing shows on Home, and all of it lives in Settings.
 *
 * Progress lives in `Shop.settings.onboarding` (server), so closing the tab and
 * coming back resumes on the same step. Only finishing or skipping a step is
 * saved: looking at another step (the step row, Back) changes nothing.
 */

export type WizardData = {
  initialStep: StepKey;
  completed: StepKey[];
  skipped: StepKey[];
  shop: {
    name: string;
    phone: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    taxRate: string;
  };
  teamCount: number;
  productCount: number;
  /** Server-wide Stripe keys are present. */
  paymentsLive: boolean;
  /** This shop has its own Stripe account attached. */
  stripeConnected: boolean;
  /** Absolute origin of the customer portal. */
  portalUrl: string;
  /** The shop's one public link, `/s/<slug>`, for the Ready step. */
  shopUrl: string;
  /** PNG data URL of the shop link, rendered on the server. Empty when not drawn. */
  shopQr?: string;
  /** Whether that link is switched on yet. */
  shopLinkLive: boolean;
  /** Something to print, when the shop already has a repair. */
  sampleTicket: { id: string; number: number } | null;
};

const BIG = "h-14 px-6 text-base";

export function OnboardingWizard({ data }: { data: WizardData }) {
  const router = useRouter();
  const [step, setStep] = React.useState<StepKey>(data.initialStep);
  const [completed, setCompleted] = React.useState<Set<StepKey>>(new Set(data.completed));
  const [skipped, setSkipped] = React.useState<Set<StepKey>>(new Set(data.skipped));
  const top = React.useRef<HTMLDivElement>(null);

  const index = stepIndex(step);
  const next = STEPS[index + 1]?.key ?? null;
  const previous = STEPS[index - 1]?.key ?? null;
  const progress = stepProgress(step, new Set([...completed, ...skipped]));

  function show(target: StepKey) {
    setStep(target);
    if ((top.current?.getBoundingClientRect().top ?? 0) < 0) top.current?.scrollIntoView({ block: "start" });
  }

  async function advance(outcome: "completed" | "skipped") {
    setCompleted((current) => {
      const updated = new Set(current);
      if (outcome === "completed") updated.add(step);
      else updated.delete(step);
      return updated;
    });
    setSkipped((current) => {
      const updated = new Set(current);
      if (outcome === "skipped") updated.add(step);
      else updated.delete(step);
      return updated;
    });

    if (next) show(next);
    const result = await advanceOnboardingAction({ step, outcome, next });
    if (!result.ok) toast.error(result.error);
  }

  async function finish() {
    const result = await finishOnboardingAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push("/");
  }

  const shared = {
    data,
    onDone: () => advance("completed"),
    onSkip: () => advance("skipped"),
    nextTitle: next ? STEPS[stepIndex(next)].title : null,
  };

  return (
    <div ref={top} className="mx-auto flex w-full max-w-4xl scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold text-foreground">{stepWords(step)}</p>
          <Button asChild variant="ghost" className="h-12 px-3 text-[15px]">
            <Link href="/">Leave setup for now</Link>
          </Button>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={stepWords(step)}
          className="h-2.5 w-full overflow-hidden rounded-full bg-surface-hover"
        >
          <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <StepRow current={step} completed={completed} skipped={skipped} onSelect={show} />

      <section aria-labelledby="setup-step-title" className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-white sm:size-24">
            <Image src={STEPS[index].photo} alt="" fill sizes="96px" className="object-contain p-2" />
          </span>
          <div className="min-w-0">
            <h2 id="setup-step-title" className="text-[24px] font-semibold leading-tight tracking-tight">
              {STEPS[index].title}
            </h2>
            <p className="text-base text-muted-foreground">{STEPS[index].blurb}</p>
          </div>
        </div>

        {step === "shop" ? <ShopStep {...shared} /> : null}
        {step === "team" ? <TeamStep {...shared} /> : null}
        {step === "payments" ? <PaymentsStep {...shared} /> : null}
        {step === "items" ? <ItemsStep {...shared} /> : null}
        {step === "ready" ? <ReadyStep data={data} onFinish={finish} /> : null}
      </section>

      {previous ? (
        <div>
          <Button variant="ghost" className="h-12 px-3 text-[15px]" onClick={() => show(previous)}>
            <ACTIONS.back aria-hidden /> Back to {STEPS[stepIndex(previous)].title.toLowerCase()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The step row
// ---------------------------------------------------------------------------

/**
 * The five steps in words, each a 48px button with its number and its state
 * ("Now", "Done", "Later"), so where you are never rests on a colour. Tapping
 * one only looks at it; nothing is saved.
 */
function StepRow({
  current,
  completed,
  skipped,
  onSelect,
}: {
  current: StepKey;
  completed: Set<StepKey>;
  skipped: Set<StepKey>;
  onSelect: (step: StepKey) => void;
}) {
  return (
    <nav aria-label="Setup steps">
      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((item, index) => {
          const state = stepState(item.key, current, completed, skipped);
          const active = item.key === current;
          return (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-full min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    active
                      ? "bg-accent-foreground text-accent"
                      : state === "Done"
                        ? "bg-accent-soft text-accent-soft-foreground"
                        : "bg-surface-hover text-muted-foreground",
                  )}
                >
                  {state === "Done" && !active ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="flex min-w-0 max-w-full flex-col">
                  <span className="truncate text-[13px] font-semibold leading-tight sm:text-[15px]">{item.title}</span>
                  {state ? (
                    <span className={cn("hidden text-[13px] leading-tight sm:block", active ? "text-accent-foreground/80" : "text-muted-foreground")}>
                      {state}
                    </span>
                  ) : null}
                  {state ? <span className="sr-only sm:hidden"> ({state})</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Every step ends the same way: one big button, and "Do this later" beside
 * it. Pinned to the bottom of a phone, so the button is never off screen.
 */
function StepFooter({
  primary,
  onSkip,
  skipLabel = "Do this later",
}: {
  primary: React.ReactNode;
  onSkip: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 pt-4 sm:static sm:mx-0 sm:px-0">
      {primary}
      <Button variant="ghost" className="h-14 px-4 text-base" onClick={onSkip}>
        {skipLabel}
      </Button>
    </div>
  );
}

type StepProps = {
  data: WizardData;
  onDone: () => void;
  onSkip: () => void;
  /** The next step's name, for the button: "Save and go to Your team". */
  nextTitle: string | null;
};

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[15px]">{label}</Label>
      {children}
      {hint ? <p className="text-[14px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const BOX = "h-12 text-base";

// ---------------------------------------------------------------------------
// 1 — Shop details + sales tax
// ---------------------------------------------------------------------------

function ShopStep({ data, onDone, onSkip, nextTitle }: StepProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(data.shop);
  const [busy, setBusy] = React.useState(false);

  function field(key: keyof typeof values) {
    return {
      value: values[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setValues((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  async function save() {
    setBusy(true);
    const result = await saveShopBasicsAction(values);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    router.refresh();
    onDone();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Shop name" htmlFor="setup-name">
          <Input id="setup-name" {...field("name")} maxLength={120} className={BOX} />
        </Field>
        <Field label="Phone" htmlFor="setup-phone">
          <Input id="setup-phone" {...field("phone")} maxLength={40} inputMode="tel" className={BOX} />
        </Field>
        <Field label="Street address" htmlFor="setup-address">
          <Input id="setup-address" {...field("address1")} maxLength={200} className={BOX} />
        </Field>
        <Field label="City" htmlFor="setup-city">
          <Input id="setup-city" {...field("city")} maxLength={80} className={BOX} />
        </Field>
        <Field label="State / province" htmlFor="setup-state">
          <Input id="setup-state" {...field("state")} maxLength={80} className={BOX} />
        </Field>
        <Field label="Postal code" htmlFor="setup-postal">
          <Input id="setup-postal" {...field("postalCode")} maxLength={20} className={BOX} />
        </Field>
        <Field label="Sales tax" htmlFor="setup-tax" hint="What new invoices start with. You can change it any time.">
          <div className="flex items-center gap-2">
            <Input id="setup-tax" {...field("taxRate")} inputMode="decimal" placeholder="5" className={cn(BOX, "w-28 text-right tabular-nums")} />
            <span className="text-base font-semibold text-muted-foreground">%</span>
          </div>
        </Field>
      </div>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={save} disabled={busy} className={BIG}>
            <Store aria-hidden /> {busy ? "Saving…" : nextTitle ? `Save and go to ${nextTitle.toLowerCase()}` : "Save"}
          </Button>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 2 — Invite the team
// ---------------------------------------------------------------------------

type InviteRow = { name: string; email: string; role: string };

function TeamStep({ data, onDone, onSkip }: StepProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<InviteRow[]>([
    { name: "", email: "", role: "TECH" },
  ]);
  const [busy, setBusy] = React.useState(false);
  const [invited, setInvited] = React.useState<InviteOutcome[]>([]);

  function update(index: number, patch: Partial<InviteRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function invite() {
    setBusy(true);
    const result = await inviteTeamAction(rows);
    setBusy(false);

    if (result.invited.length > 0) setInvited(result.invited);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${result.invited.length} ${result.invited.length === 1 ? "person" : "people"} added.`,
    );
    router.refresh();
  }

  if (invited.length > 0) {
    return (
      <>
        <p className="text-base leading-relaxed text-foreground">
          Added. Each person gets an email with a link to set their own
          password, good for three days. Where a link shows below, emails are
          not set up yet: copy it and send it to them yourself.
        </p>
        <ul className="flex flex-col gap-2">
          {invited.map((person) => (
            <li
              key={person.email}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold text-foreground">
                  {person.name}
                </span>
                <span className="truncate text-[14px] text-muted-foreground">
                  {person.email}
                </span>
              </span>
              {person.inviteUrl ? (
                <ShareLinkActions
                  url={person.inviteUrl}
                  qrDataUrl=""
                  linkName={`invite for ${person.name}`}
                  signTitle=""
                  signLine=""
                  fileName="invite.png"
                  showOpen={false}
                />
              ) : (
                <StatusPill tone="success" label="Emailed" className="shrink-0" />
              )}
            </li>
          ))}
        </ul>
        <StepFooter
          onSkip={onSkip}
          primary={
            <Button onClick={onDone} className={BIG}>
              Done <ACTIONS.next aria-hidden />
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {data.teamCount > 1 ? (
        <p className="rounded-xl bg-surface-hover px-4 py-3 text-[15px] font-medium text-foreground">
          {data.teamCount} people already have accounts in this shop.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-end sm:border-0 sm:p-0"
          >
            <Field label="Name" htmlFor={`team-name-${index}`}>
              <Input
                id={`team-name-${index}`}
                value={row.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Jordan Lee"
                maxLength={120}
                className={BOX}
              />
            </Field>
            <Field label="Email" htmlFor={`team-email-${index}`}>
              <Input
                id={`team-email-${index}`}
                type="email"
                inputMode="email"
                value={row.email}
                onChange={(event) => update(index, { email: event.target.value })}
                placeholder="jordan@example.com"
                className={BOX}
              />
            </Field>
            <Field label="What they do" htmlFor={`team-role-${index}`}>
              <Select
                value={row.role}
                onValueChange={(value) => update(index, { role: value })}
              >
                <SelectTrigger id={`team-role-${index}`} className={cn(BOX, "sm:w-[160px]")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4"
              aria-label={`Remove person ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
            >
              <ACTIONS.delete aria-hidden /> Remove
            </Button>
          </li>
        ))}
      </ul>

      <div>
        <Button
          type="button"
          variant="outline"
          className="h-12 px-4"
          disabled={rows.length >= 10}
          onClick={() =>
            setRows((current) => [...current, { name: "", email: "", role: "TECH" }])
          }
        >
          <ACTIONS.add aria-hidden /> Add another person
        </Button>
      </div>

      <ul className="flex flex-col gap-1 text-[15px] leading-relaxed text-muted-foreground">
        {ROLE_OPTIONS.map((role) => (
          <li key={role.value}>
            <span className="font-semibold text-foreground">{role.label}:</span> {ROLE_BLURB[role.value]}
          </li>
        ))}
      </ul>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={invite} disabled={busy} className={BIG}>
            <ACTIONS.send aria-hidden /> {busy ? "Adding…" : "Add these people"}
          </Button>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 3 — Getting paid
// ---------------------------------------------------------------------------

function PaymentsStep({ data, onDone, onSkip, nextTitle }: StepProps) {
  const cardsOn = data.stripeConnected;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-3">
        <MethodTile
          photo="/images/home/cash-register.webp"
          title="Cash and cheque"
          state="Ready"
          tone="success"
          body="Works today. Record the payment on the invoice and the balance keeps itself."
        />
        <MethodTile
          photo="/images/products/phone.webp"
          title="Card payments"
          state={cardsOn ? "On" : data.paymentsLive ? "Not connected yet" : "Not set up yet"}
          tone={cardsOn ? "success" : "neutral"}
          body={
            cardsOn
              ? "Emailed invoices get a Pay button and mark themselves paid."
              : data.paymentsLive
                ? "Connect a card account and emailed invoices get a Pay button."
                : "Ask your installer to turn card payments on, then connect them here."
          }
        />
        <MethodTile
          photo="/images/home/card-terminal.webp"
          title="Card machine"
          state={cardsOn ? "Can be added" : "After card payments"}
          tone="neutral"
          body="Any card machine works. Choose whether the amount is sent to it or typed in."
        />
      </ul>

      <p className="text-[15px] leading-relaxed text-muted-foreground">
        You can bill customers and take cash today; card payments can wait until the paperwork is done.
      </p>

      <StepFooter
        onSkip={onSkip}
        skipLabel="Do this later"
        primary={
          <>
            <Button onClick={onDone} className={BIG}>
              {nextTitle ? `Next: ${nextTitle.toLowerCase()}` : "Done"} <ACTIONS.next aria-hidden />
            </Button>
            <Button asChild variant="outline" className={BIG}>
              <Link href="/settings?tab=payments">Set up card payments</Link>
            </Button>
          </>
        }
      />
    </>
  );
}

function MethodTile({
  photo,
  title,
  state,
  tone,
  body,
}: {
  photo: string;
  title: string;
  state: string;
  tone: StatusTone;
  body: string;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <span className="relative block aspect-[4/3] w-full bg-white">
        <Image src={photo} alt="" fill sizes="(max-width: 640px) 90vw, 260px" className="object-contain p-3" />
      </span>
      <span className="flex flex-col gap-1.5 p-3">
        <span className="text-lg font-semibold leading-tight">{title}</span>
        <StatusPill tone={tone} label={state} className="text-[13px]" />
        <span className="text-[14px] leading-snug text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 4 — First items
// ---------------------------------------------------------------------------

type ItemRow = { name: string; price: string; taxable: boolean };

function ItemsStep({ data, onDone, onSkip }: StepProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ItemRow[]>([
    { name: "", price: "", taxable: true },
  ]);
  const [busy, setBusy] = React.useState(false);

  function update(index: number, patch: Partial<ItemRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    setBusy(true);
    const result = await createStarterItemsAction(rows);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${result.created} ${result.created === 1 ? "item" : "items"} added.`,
    );
    router.refresh();
    onDone();
  }

  return (
    <>
      {data.productCount > 0 ? (
        <p className="rounded-xl bg-surface-hover px-4 py-3 text-[15px] font-medium text-foreground">
          {data.productCount} {data.productCount === 1 ? "item is" : "items are"}{" "}
          already in your stock.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end sm:border-0 sm:p-0"
          >
            <Field label="Job or part" htmlFor={`item-name-${index}`}>
              <Input
                id={`item-name-${index}`}
                value={row.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="Screen replacement"
                maxLength={120}
                className={BOX}
              />
            </Field>
            <Field label="Price" htmlFor={`item-price-${index}`}>
              <Input
                id={`item-price-${index}`}
                value={row.price}
                onChange={(event) => update(index, { price: event.target.value })}
                inputMode="decimal"
                placeholder="149.00"
                className={cn(BOX, "text-right tabular-nums")}
              />
            </Field>
            <label className="flex min-h-12 items-center gap-2.5">
              <Switch
                checked={row.taxable}
                onCheckedChange={(value) => update(index, { taxable: value })}
                words={["Taxed", "No tax"]}
                aria-label={`${row.name || `Item ${index + 1}`} is taxed`}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4"
              aria-label={`Remove item ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
            >
              <ACTIONS.delete aria-hidden /> Remove
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 px-4"
          disabled={rows.length >= 3}
          onClick={() =>
            setRows((current) => [...current, { name: "", price: "", taxable: true }])
          }
        >
          <ACTIONS.add aria-hidden /> Add another
        </Button>
        <Button type="button" variant="ghost" className="h-12 px-4" asChild>
          <Link href="/inventory/new">Add one with stock and a barcode instead</Link>
        </Button>
      </div>

      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Two or three of your most common jobs is plenty. They become one-tap
        lines on repairs, quotes and the register.
      </p>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={save} disabled={busy} className={BIG}>
            <ACTIONS.add aria-hidden /> {busy ? "Adding…" : "Add to my stock"}
          </Button>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 5 — Ready
// ---------------------------------------------------------------------------

function ReadyStep({
  data,
  onFinish,
}: {
  data: WizardData;
  onFinish: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-3">
        {/* The shop link leads: it is the one thing here that brings customers in. */}
        <ReadyTile
          photo="/images/home/display-screen.webp"
          title="Share your link"
          state={data.shopLinkLive ? "On" : "Off"}
          tone={data.shopLinkLive ? "success" : "neutral"}
          body="One link for customers to check a repair, book, ask for a price and pay."
        >
          {data.shopLinkLive ? (
            <ShareLinkActions
              url={data.shopUrl}
              qrDataUrl={data.shopQr ?? ""}
              linkName="shop link"
              signTitle="Scan for repairs, prices and payments"
              signLine="Check your repair, book a visit, ask for a price or pay a bill."
              fileName="shop-link.png"
              showOpen={false}
              className="[&_button]:w-full [&_button]:justify-start"
            />
          ) : (
            <Button asChild variant="outline" className="h-12 w-full">
              <Link href="/settings?tab=connect">Switch my link on</Link>
            </Button>
          )}
        </ReadyTile>

        <ReadyTile
          photo="/images/products/repair-tools.webp"
          title="Print a test repair"
          body="One test page now, rather than with a customer waiting at the counter."
        >
          {data.sampleTicket ? (
            <Button asChild variant="outline" className="h-12 w-full">
              <a href={`/print/tickets/${data.sampleTicket.id}`} target="_blank" rel="noreferrer">
                <Printer aria-hidden /> Print repair #{data.sampleTicket.number}
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-12 w-full">
              <Link href="/tickets/new">Check in a first repair</Link>
            </Button>
          )}
        </ReadyTile>

        <ReadyTile
          photo="/images/home/toolbox.webp"
          title="Open your shop"
          body="Home has everything one tap away. Anything you skipped waits there, and all of it lives in Settings."
        />
      </ul>

      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Every repair, quote and invoice you send carries a link to the customer&rsquo;s own page, where
        they can approve, follow the repair and pay. Nothing to set up.
      </p>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border bg-surface px-4 pt-4 sm:static sm:mx-0 sm:px-0">
        <Button
          onClick={() => {
            setBusy(true);
            onFinish();
          }}
          disabled={busy}
          className={cn(BIG, "w-full sm:w-auto")}
        >
          <Check aria-hidden /> {busy ? "Opening…" : "Start selling"}
        </Button>
      </div>
    </>
  );
}

function ReadyTile({
  photo,
  title,
  state,
  tone = "neutral",
  body,
  children,
}: {
  photo: string;
  title: string;
  state?: string;
  tone?: StatusTone;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <span className="relative block aspect-[16/10] w-full bg-white">
        <Image src={photo} alt="" fill sizes="(max-width: 768px) 90vw, 280px" className="object-contain p-3" />
      </span>
      <span className="flex flex-1 flex-col gap-2 p-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold leading-tight">{title}</span>
          {state ? <StatusPill tone={tone} label={state} className="text-[13px]" /> : null}
        </span>
        <span className="text-[14px] leading-snug text-muted-foreground">{body}</span>
        {children ? <span className="mt-auto flex flex-col gap-2 pt-1">{children}</span> : null}
      </span>
    </li>
  );
}
