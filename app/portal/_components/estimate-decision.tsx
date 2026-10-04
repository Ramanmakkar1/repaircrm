"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import SignatureCanvas from "react-signature-canvas";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IDLE_FORM_STATE } from "@/components/billing/types";
import { respondToEstimateAction } from "../actions";

/**
 * Yes or no to an estimate, the way a till does it: the total and one big
 * black "Approve" sit in a bar at the bottom of the screen (pinned while the
 * customer reads the items on a phone), and nothing is committed on the first
 * tap. Approve opens one short confirm step ("Go ahead with this repair?")
 * with an optional signature; "No thanks" opens its own confirm. Approving by
 * accident used to commit the shop to work in one tap.
 *
 * One form, one action (respondToEstimateAction): the answer travels as the
 * submit button's own name/value, the signature as a hidden field.
 *
 * The pad always paints dark-on-white regardless of theme, because the image is
 * embedded in a printed document later.
 */

type Step = "idle" | "approve" | "decline";

export function EstimateDecision({
  estimateId,
  totalLabel,
  expired = false,
}: {
  estimateId: string;
  /** "$165.49", already formatted. */
  totalLabel: string;
  /** Past its valid-until date: still answerable, but say so. */
  expired?: boolean;
}) {
  const [state, formAction] = useActionState(respondToEstimateAction, IDLE_FORM_STATE);
  const [step, setStep] = React.useState<Step>("idle");
  const [dataUrl, setDataUrl] = React.useState("");
  const padRef = React.useRef<SignatureCanvas | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Opening a confirm step puts it in view and the keyboard focus on its title.
  React.useEffect(() => {
    if (step === "idle") return;
    const panel = panelRef.current;
    panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    panel?.querySelector<HTMLElement>("[data-confirm-title]")?.focus();
  }, [step]);

  const capture = () => {
    const pad = padRef.current;
    setDataUrl(pad && !pad.isEmpty() ? pad.toDataURL("image/png") : "");
  };

  const clear = () => {
    padRef.current?.clear();
    setDataUrl("");
  };

  return (
    <form
      action={formAction}
      className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lg sm:bottom-4 sm:mx-0 sm:rounded-2xl sm:border sm:px-6 sm:py-5"
    >
      <input type="hidden" name="id" value={estimateId} />
      <input type="hidden" name="signature" value={step === "approve" ? dataUrl : ""} />

      {state.error ? (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-[15px] leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      ) : null}

      {step === "idle" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums">{totalLabel}</span>
          </div>
          {expired ? (
            <p className="text-[14px] text-muted-foreground">
              This estimate is past its valid-until date. You can still answer; the shop may update the price.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button type="button" size="lg" className={cn(HUGE_BUTTON, "sm:w-auto sm:min-w-64")} onClick={() => setStep("approve")}>
              <Check aria-hidden />
              Approve {totalLabel}
            </Button>
            <Button type="button" size="lg" variant="ghost" className={BIG_BUTTON} onClick={() => setStep("decline")}>
              No thanks
            </Button>
          </div>
        </div>
      ) : (
        <div ref={panelRef} className="flex flex-col gap-4">
          <div>
            <h2 data-confirm-title tabIndex={-1} className="text-xl font-bold leading-tight focus-visible:outline-none">
              {step === "approve" ? "Go ahead with this repair?" : "Say no to this estimate?"}
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
              {step === "approve"
                ? `The shop gets the go-ahead to do this work for ${totalLabel}.`
                : "Nothing will be done and nothing is charged. Call the shop if you change your mind."}
            </p>
          </div>

          {step === "approve" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">Sign here (optional)</span>
                <Button type="button" variant="ghost" size="lg" className="h-12 px-3 text-[15px]" onClick={clear}>
                  Clear
                </Button>
              </div>
              <div className="rounded-xl border border-border-strong bg-white p-1">
                <SignatureCanvas
                  ref={padRef}
                  penColor="#1c1a17"
                  onEnd={capture}
                  canvasProps={{
                    className: "block h-[140px] w-full touch-none rounded-lg",
                    "aria-label": "Signature pad",
                  }}
                />
              </div>
              <p className="text-[14px] text-muted-foreground">Sign with a finger, a stylus or a mouse, or approve without signing.</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Decide decision={step === "approve" ? "approve" : "decline"}>
              {step === "approve" ? `Yes, approve ${totalLabel}` : "Yes, say no"}
            </Decide>
            <Button type="button" size="lg" variant="outline" className={BIG_BUTTON} onClick={() => setStep("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * The answer travels as the submitter's own name/value, so one form can carry
 * both outcomes without a hidden field that could get out of sync.
 */
function Decide({ decision, children }: { decision: "approve" | "decline"; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      size="lg"
      disabled={pending}
      className={cn(HUGE_BUTTON, "sm:w-auto sm:min-w-64")}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      {pending ? "Sending your answer…" : children}
    </Button>
  );
}
