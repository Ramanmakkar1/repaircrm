"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import type {
  CardMachineMode,
  CardMachineProvider,
  CardMachineSetting,
} from "@/lib/payments/card-machine";

type Result = { ok: true; message: string } | { ok: false; error: string };

const PROVIDER_LABEL: Record<CardMachineProvider, string> = {
  stripe: "Stripe Terminal",
  square: "Square Terminal",
};

/**
 * Settings → Payments → "When a customer pays by card".
 *
 * Always rendered, even for a shop with no processor connected: a standalone
 * machine from the bank is how most counters take cards, and that shop still
 * deserves a Card button that does the right thing. The choice saves the moment
 * it is tapped — there is no form to forget to submit.
 */
export function CardMachineModeCard({
  setting,
  machines,
  action,
}: {
  setting: CardMachineSetting;
  /** What is paired right now. Drives the honest note under "Automatic". */
  machines: { stripe: boolean; square: boolean };
  action: (input: CardMachineSetting) => Promise<Result>;
}) {
  const [current, setCurrent] = React.useState(setting);
  const [pending, startTransition] = React.useTransition();
  const anyMachine = machines.stripe || machines.square;
  const bothMachines = machines.stripe && machines.square;

  const save = (next: CardMachineSetting) => {
    if (pending) return;
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await action(next);
      if (result.ok) {
        toast.success(result.message);
      } else {
        setCurrent(previous);
        toast.error(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader
        icon={ACTIONS.pay}
        title="When a customer pays by card"
        description="Choose what the Card button does at the register and on invoices. You can switch any time, and staff can always use the other way for a single payment."
        action={pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      />
      <CardContent className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Card machine" className="grid gap-3 sm:grid-cols-2">
          <ModeOption
            mode="auto"
            selected={current.mode === "auto"}
            disabled={pending}
            title="Automatic"
            body="The amount goes straight to your card machine. The customer taps, and the sale marks itself paid. Nothing to re-type."
            onSelect={() => save({ ...current, mode: "auto" })}
          />
          <ModeOption
            mode="manual"
            selected={current.mode === "manual"}
            disabled={pending}
            title="Manual"
            body="Keep the card machine you already have. We show the amount, you key it into your machine, then tap Approved here."
            onSelect={() => save({ ...current, mode: "manual" })}
          />
        </div>

        {current.mode === "auto" && !anyMachine ? (
          <p className="rounded-md bg-surface-hover px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
            No card machine is connected yet, so Card works the manual way for
            now. Connect a Stripe or Square machine below and it switches to
            automatic by itself.
          </p>
        ) : null}

        {current.mode === "auto" && bothMachines ? (
          <div className="flex flex-col gap-2">
            <span className="text-[13.5px] font-semibold text-foreground">
              Send the amount to
            </span>
            <div className="flex flex-wrap gap-2">
              {([null, "stripe", "square"] as const).map((provider) => {
                const selected = current.provider === provider;
                return (
                  <button
                    key={provider ?? "ask"}
                    type="button"
                    disabled={pending}
                    aria-pressed={selected}
                    onClick={() => save({ ...current, provider })}
                    className={cn(
                      "h-10 rounded-md border px-4 text-[13.5px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border-strong bg-surface text-foreground hover:bg-surface-hover",
                    )}
                  >
                    {provider ? PROVIDER_LABEL[provider] : "Ask each time"}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ModeOption({
  mode,
  selected,
  disabled,
  title,
  body,
  onSelect,
}: {
  mode: CardMachineMode;
  selected: boolean;
  disabled: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-mode={mode}
      disabled={disabled}
      onClick={() => {
        if (!selected) onSelect();
      }}
      className={cn(
        "flex min-h-28 flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-accent bg-accent-soft"
          : "border-border-strong bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-foreground">{title}</span>
        {selected ? (
          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-accent">
            <CheckCircle2 className="size-4" /> In use
          </span>
        ) : null}
      </span>
      <span className="text-[13.5px] leading-relaxed text-muted-foreground">{body}</span>
    </button>
  );
}
