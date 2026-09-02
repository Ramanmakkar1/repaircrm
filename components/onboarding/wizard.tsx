"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// Check is the "you're done" tick; the rest of these are the concepts each
// wizard step is about, and come from ICONS below.
import { Check } from "lucide-react";
import { toast } from "sonner";

import {
  advanceOnboardingAction,
  createStarterItemsAction,
  finishOnboardingAction,
  inviteTeamAction,
  saveShopBasicsAction,
  setOnboardingStepAction,
  type InviteOutcome,
} from "@/app/(app)/setup/actions";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
import { cn } from "@/components/ui/cn";
import { ROLE_OPTIONS } from "@/components/settings/types";
import { STEPS, stepIndex, type StepKey } from "./steps";

/**
 * The first-run wizard, reached straight after signup.
 *
 * Five cards, one question each, every one skippable. That last part is not a
 * courtesy — a shop owner who signed up at 7pm to see whether this thing works
 * will abandon a wizard that traps them, and a half-configured shop they can
 * finish later is worth infinitely more than a bounce. Every step's answer is
 * also reachable from Settings afterwards, and whatever is still missing shows
 * up on the dashboard checklist.
 *
 * Progress lives in `Shop.settings.onboarding` (server), not in this
 * component's state, so closing the tab and coming back resumes on the same
 * card rather than starting over.
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
  /** Absolute origin of the customer portal, for the Ready card. */
  portalUrl: string;
  /** Something to print, when the shop already has a ticket. */
  sampleTicket: { id: string; number: number } | null;
};

export function OnboardingWizard({ data }: { data: WizardData }) {
  const router = useRouter();
  const [step, setStep] = React.useState<StepKey>(data.initialStep);
  const [completed, setCompleted] = React.useState<Set<StepKey>>(
    new Set(data.completed),
  );
  const [skipped, setSkipped] = React.useState<Set<StepKey>>(new Set(data.skipped));

  const index = stepIndex(step);
  const next = STEPS[index + 1]?.key ?? null;
  const previous = STEPS[index - 1]?.key ?? null;

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

    if (next) setStep(next);
    const result = await advanceOnboardingAction({ step, outcome, next });
    if (!result.ok) toast.error(result.error);
  }

  async function goTo(target: StepKey) {
    setStep(target);
    const result = await setOnboardingStepAction(target);
    if (!result.ok) toast.error(result.error);
  }

  async function finish() {
    const result = await finishOnboardingAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push("/dashboard");
  }

  const shared = {
    onDone: () => advance("completed"),
    onSkip: () => advance("skipped"),
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Dots
        current={step}
        completed={completed}
        skipped={skipped}
        onSelect={goTo}
      />

      <Card>
        <div className="flex flex-col gap-1.5 border-b border-border px-6 py-5">
          <span className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Step {index + 1} of {STEPS.length}
          </span>
          <h2 className="text-[21px] font-bold leading-tight tracking-tight text-foreground">
            {STEPS[index].title}
          </h2>
          <p className="text-[15px] leading-snug text-muted-foreground">
            {STEPS[index].blurb}
          </p>
        </div>

        {step === "shop" ? <ShopStep data={data} {...shared} /> : null}
        {step === "team" ? <TeamStep data={data} {...shared} /> : null}
        {step === "payments" ? <PaymentsStep data={data} {...shared} /> : null}
        {step === "items" ? <ItemsStep data={data} {...shared} /> : null}
        {step === "ready" ? <ReadyStep data={data} onFinish={finish} /> : null}
      </Card>

      <div className="flex items-center justify-between">
        {previous ? (
          <Button variant="ghost" size="sm" onClick={() => goTo(previous)}>
            <ACTIONS.back /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">Leave setup for now</Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function Dots({
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
    <ol className="flex items-center justify-center gap-2">
      {STEPS.map((step) => {
        const active = step.key === current;
        const done = completed.has(step.key);
        const passed = skipped.has(step.key);
        return (
          <li key={step.key}>
            <button
              type="button"
              onClick={() => onSelect(step.key)}
              aria-current={active ? "step" : undefined}
              aria-label={step.title}
              title={step.title}
              className={cn(
                "flex h-2.5 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active ? "w-9 bg-accent" : "w-2.5",
                !active && done && "bg-status-resolved",
                !active && !done && passed && "bg-border-strong",
                !active && !done && !passed && "bg-border",
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** Every step card ends the same way: one primary action and a visible skip. */
function StepFooter({
  primary,
  onSkip,
  skipLabel = "Skip for now",
}: {
  primary: React.ReactNode;
  onSkip: () => void;
  skipLabel?: string;
}) {
  return (
    <CardFooter className="justify-between">
      {primary}
      <Button variant="ghost" size="sm" onClick={onSkip}>
        {skipLabel}
      </Button>
    </CardFooter>
  );
}

type StepProps = {
  data: WizardData;
  onDone: () => void;
  onSkip: () => void;
};

// ---------------------------------------------------------------------------
// 1 — Shop details + sales tax
// ---------------------------------------------------------------------------

function ShopStep({ data, onDone, onSkip }: StepProps) {
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
    toast.success("Shop details saved.");
    router.refresh();
    onDone();
  }

  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-name">Shop name</Label>
          <Input id="setup-name" {...field("name")} maxLength={120} autoFocus />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-phone">Phone</Label>
            <Input id="setup-phone" {...field("phone")} maxLength={40} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-tax">Sales tax rate</Label>
            <div className="flex items-center gap-2">
              <Input
                id="setup-tax"
                {...field("taxRate")}
                inputMode="decimal"
                placeholder="8.25"
              />
              <span className="text-[15px] font-semibold text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-address">Street address</Label>
          <Input id="setup-address" {...field("address1")} maxLength={200} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-city">City</Label>
            <Input id="setup-city" {...field("city")} maxLength={80} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-state">State / province</Label>
            <Input id="setup-state" {...field("state")} maxLength={80} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="setup-postal">Postal code</Label>
            <Input id="setup-postal" {...field("postalCode")} maxLength={20} />
          </div>
        </div>

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          This block prints at the top of every estimate, invoice and receipt,
          and the tax rate is what new documents start from. Both are editable
          later in Settings.
        </p>
      </CardContent>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={save} disabled={busy}>
            <ICONS.vendor /> {busy ? "Saving…" : "Save and continue"}
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
        <CardContent className="flex flex-col gap-4">
          <p className="text-[14.5px] leading-relaxed text-foreground">
            Added. Each person gets an email with a link to set their own
            password, good for 72 hours. Where a link is shown below, no mail
            provider is configured yet — copy it and hand it over instead.
          </p>
          <ul className="flex flex-col gap-2">
            {invited.map((person) => (
              <li
                key={person.email}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-hover px-4 py-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] font-semibold text-foreground">
                    {person.name}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {person.email}
                  </span>
                </span>
                {person.inviteUrl ? (
                  <code className="select-all break-all rounded-sm bg-surface px-2.5 py-1.5 font-mono text-[12.5px] font-semibold text-foreground">
                    {person.inviteUrl}
                  </code>
                ) : (
                  <StatusPill
                    tone="success"
                    label="Emailed"
                    className="shrink-0"
                  />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <Button onClick={onDone}>
            Done <ACTIONS.next />
          </Button>
        </CardFooter>
      </>
    );
  }

  return (
    <>
      <CardContent className="flex flex-col gap-4">
        {data.teamCount > 1 ? (
          <p className="rounded-md bg-status-resolved-bg px-4 py-3 text-[13.5px] font-medium text-status-resolved-fg">
            {data.teamCount} people already have accounts in this shop.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.3fr_auto_auto] sm:items-end"
            >
              <div className="flex flex-col gap-1.5">
                {index === 0 ? <Label>Name</Label> : null}
                <Input
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="Jordan Lee"
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {index === 0 ? <Label>Email</Label> : null}
                <Input
                  type="email"
                  value={row.email}
                  onChange={(event) => update(index, { email: event.target.value })}
                  placeholder="jordan@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {index === 0 ? <Label>Role</Label> : null}
                <Select
                  value={row.role}
                  onValueChange={(value) => update(index, { role: value })}
                >
                  <SelectTrigger className="sm:w-[150px]">
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
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this person"
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
              >
                <ACTIONS.delete />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={rows.length >= 10}
          onClick={() =>
            setRows((current) => [...current, { name: "", email: "", role: "TECH" }])
          }
        >
          <ACTIONS.add /> Add another
        </Button>

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Technicians see tickets and time. Front desk adds intake, customers
          and billing. Owners see everything, including settings.
        </p>
      </CardContent>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={invite} disabled={busy}>
            <ICONS.team /> {busy ? "Adding…" : "Add these people"}
          </Button>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 3 — Getting paid
// ---------------------------------------------------------------------------

function PaymentsStep({ data, onDone, onSkip }: StepProps) {
  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          <Method
            icon={ICONS.payment}
            title="Online card payments"
            body="Invoices you email carry a Pay button, the customer pays on Stripe's own page, and the invoice marks itself paid. Nothing sensitive touches this server."
            state={
              data.stripeConnected
                ? "Connected"
                : data.paymentsLive
                  ? "Available — not connected yet"
                  : "Not switched on for this server"
            }
            live={data.stripeConnected}
          />
          <Method
            icon={ICONS.cardMachine}
            title="Card machine at the counter"
            body="Take a chip or tap payment on the front desk and it lands on the same invoice, so the day's takings reconcile without a second system."
            state="Set up alongside online payments"
            live={data.stripeConnected}
          />
          <Method
            icon={ICONS.pos}
            title="Cash and cheque"
            body="Already works, nothing to configure. Record the tender on the invoice and RepairFlow keeps the balance."
            state="Ready"
            live
          />
        </ul>

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          You can bill customers and take cash today; card payments can wait
          until the paperwork is done.
        </p>
      </CardContent>

      <StepFooter
        onSkip={onSkip}
        skipLabel="I'll set this up later"
        primary={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href="/settings?tab=payments">
                <ICONS.payment /> Open payment settings
              </Link>
            </Button>
            <Button variant="outline" onClick={onDone}>
              Done here
            </Button>
          </div>
        }
      />
    </>
  );
}

function Method({
  icon: Icon,
  title,
  body,
  state,
  live,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  state: string;
  live: boolean;
}) {
  return (
    <li className="flex gap-3.5 rounded-md border border-border p-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          live
            ? "bg-status-resolved-bg text-status-resolved-fg"
            : "bg-surface-hover text-muted-foreground",
        )}
      >
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-[15px] font-bold text-foreground">{title}</span>
          <span className="text-[12.5px] font-semibold text-muted-foreground">
            {state}
          </span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
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
      <CardContent className="flex flex-col gap-4">
        {data.productCount > 0 ? (
          <p className="rounded-md bg-status-resolved-bg px-4 py-3 text-[13.5px] font-medium text-status-resolved-fg">
            {data.productCount} {data.productCount === 1 ? "item is" : "items are"}{" "}
            already in your catalogue.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end"
            >
              <div className="flex flex-col gap-1.5">
                {index === 0 ? <Label>Item or service</Label> : null}
                <Input
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="Screen replacement"
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {index === 0 ? <Label>Price</Label> : null}
                <Input
                  value={row.price}
                  onChange={(event) => update(index, { price: event.target.value })}
                  inputMode="decimal"
                  placeholder="149.00"
                />
              </div>
              <div className="flex items-center gap-2 pb-2.5">
                <Switch
                  id={`taxable-${index}`}
                  checked={row.taxable}
                  onCheckedChange={(value) => update(index, { taxable: value })}
                />
                <Label htmlFor={`taxable-${index}`} className="font-medium">
                  Taxable
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this item"
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
              >
                <ACTIONS.delete />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= 3}
            onClick={() =>
              setRows((current) => [...current, { name: "", price: "", taxable: true }])
            }
          >
            <ACTIONS.add /> Add another
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/inventory/new">Add one with stock and SKU instead</Link>
          </Button>
        </div>

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Two or three of your most common jobs is plenty. They become one-tap
          lines on tickets, estimates and the register.
        </p>
      </CardContent>

      <StepFooter
        onSkip={onSkip}
        primary={
          <Button onClick={save} disabled={busy}>
            <ICONS.product /> {busy ? "Adding…" : "Add to catalogue"}
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
  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-md border border-border p-4">
          <span className="text-[15px] font-bold text-foreground">
            Your customer portal
          </span>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Every ticket, estimate and invoice you send carries a link into this
            portal. Customers approve estimates, watch a repair&apos;s progress
            and pay their bill there — without an account, and without phoning
            the front desk to ask.
          </p>
          <code className="w-fit break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[12.5px] text-foreground">
            {data.portalUrl}
          </code>
        </div>

        {data.sampleTicket ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-4">
            <span className="text-[15px] font-bold text-foreground">
              Check your printer
            </span>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Ticket #{data.sampleTicket.number} opens as a printable work order.
              Worth one test page now rather than with a customer at the counter.
            </p>
            <Button variant="outline" size="sm" className="w-fit" asChild>
              <a
                href={`/print/tickets/${data.sampleTicket.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ACTIONS.print /> Print a test ticket
              </a>
            </Button>
          </div>
        ) : null}

        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Anything you skipped is waiting on the dashboard, and all of it lives
          in Settings.
        </p>
      </CardContent>

      <CardFooter className="justify-between">
        <Button onClick={onFinish}>
          <Check /> Finish and open the dashboard
        </Button>
      </CardFooter>
    </>
  );
}
