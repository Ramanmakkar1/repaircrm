"use client";

import * as React from "react";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import type { TerminalStep, UseStripeTerminal } from "./use-stripe-terminal";

/**
 * The card-machine step, rendered the same way at the till and on an invoice.
 *
 * There is exactly ONE thing on screen at a time — the amount, and the sentence
 * describing what the cashier should be doing about it. A payment flow that
 * shows a progress bar, a spinner, a machine name and three buttons at once is
 * a flow where somebody taps a card during "connecting" and then taps it again.
 *
 * The panel connects to the machine the moment it is mounted, so by the time
 * the cashier has read the amount the everyday sale is one tap. The picker only
 * appears when the hook could not decide on its own; see use-stripe-terminal.ts.
 *
 * The colours follow the app's status palette rather than introducing a new
 * one: waiting is amber, approved is green, a decline is the destructive red
 * every other error in the app uses.
 */
export function TerminalPanel({
  amountCents,
  terminal,
  onStart,
  startLabel = "Take payment on the card machine",
  fallback,
  className,
}: {
  amountCents: number;
  terminal: UseStripeTerminal;
  onStart: () => void;
  startLabel?: string;
  /**
   * Shown when there is no machine to use — a payment link, usually. Rendered
   * under the one-sentence explanation of why the machine is not an option.
   */
  fallback?: React.ReactNode;
  className?: string;
}) {
  const { step, message, error, busy, readerLabel, choices, unavailable, prepare } =
    terminal;

  // Connect ahead of the cashier. `prepare` is a no-op once connected, so a
  // re-render or a second opening of the dialog costs nothing.
  React.useEffect(() => {
    void prepare();
  }, [prepare]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-border bg-surface-hover px-5 py-6 text-center",
        className,
      )}
    >
      <StepIcon step={step} />

      <div className="flex flex-col gap-1.5">
        <span className="text-3xl font-bold leading-none tabular-nums tracking-tight text-foreground">
          {formatCents(amountCents)}
        </span>
        <span
          className={cn(
            "text-[14px] font-semibold",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message}
        </span>
        {readerLabel && !error ? (
          <span className="text-[13px] text-faint-foreground">
            Card machine: {readerLabel}
          </span>
        ) : null}
      </div>

      {step === "choose" ? (
        <div className="flex w-full flex-col gap-2">
          {choices.map((choice) => (
            <Button
              key={choice.id}
              type="button"
              variant="outline"
              size="lg"
              disabled={!choice.online}
              onClick={() => void terminal.choose(choice.id)}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Smartphone />
                {choice.label}
                {choice.simulated ? (
                  <span className="rounded-full bg-status-waiting-bg px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-status-waiting-fg">
                    Practice
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {choice.online ? "Ready" : "Not answering"}
              </span>
            </Button>
          ))}
        </div>
      ) : unavailable && step !== "approved" ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            {unavailable}
          </p>
          {fallback}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={onStart}
            className="w-full"
          >
            <RefreshCw /> Look again
          </Button>
        </div>
      ) : step === "approved" ? null : (
        <Button
          type="button"
          size="lg"
          variant={error ? "outline" : "default"}
          disabled={busy}
          onClick={onStart}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Working…
            </>
          ) : error ? (
            <>
              <RefreshCw /> Try again
            </>
          ) : (
            <>
              <CreditCard /> {startLabel}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function StepIcon({ step }: { step: TerminalStep }) {
  if (step === "approved") {
    return (
      <span className="flex size-14 items-center justify-center rounded-full bg-status-resolved-bg text-status-resolved-fg">
        <CheckCircle2 className="size-7" strokeWidth={2.25} />
      </span>
    );
  }
  if (step === "error") {
    return (
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <TriangleAlert className="size-7" strokeWidth={2.25} />
      </span>
    );
  }
  if (step === "present") {
    return (
      <span className="flex size-14 animate-pulse items-center justify-center rounded-full bg-status-waiting-bg text-status-waiting-fg">
        <Smartphone className="size-7" strokeWidth={2.25} />
      </span>
    );
  }
  if (step === "idle" || step === "choose") {
    return (
      <span className="flex size-14 items-center justify-center rounded-full bg-surface text-muted-foreground">
        <CreditCard className="size-7" strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span className="flex size-14 items-center justify-center rounded-full bg-surface text-accent">
      <Loader2 className="size-7 animate-spin" strokeWidth={2.25} />
    </span>
  );
}
