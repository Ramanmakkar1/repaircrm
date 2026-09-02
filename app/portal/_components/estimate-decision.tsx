"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import SignatureCanvas from "react-signature-canvas";
import { AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { IDLE_FORM_STATE } from "@/components/billing/types";
import { respondToEstimateAction } from "../actions";

/**
 * Approve / decline, as the customer sees it.
 *
 * Two shapes, one action:
 *   "inline" — a pair of buttons on the hub, for someone who already knows what
 *              they are approving and just wants it moving.
 *   "full"   — the detail page, where an optional signature pad appears once
 *              they choose Approve. The signature is optional on purpose: making
 *              it mandatory turns a one-tap yes into a fight with a trackpad.
 *
 * The pad always paints dark-on-white regardless of theme, because the image is
 * embedded in a printed document later.
 */

const ApproveIcon = ACTIONS.approve;
const DeclineIcon = ACTIONS.decline;
const SignatureIcon = ICONS.signature;

export function EstimateDecision({
  estimateId,
  variant = "inline",
}: {
  estimateId: string;
  variant?: "inline" | "full";
}) {
  const [state, formAction] = useActionState(
    respondToEstimateAction,
    IDLE_FORM_STATE,
  );
  const [signing, setSigning] = React.useState(false);
  const [dataUrl, setDataUrl] = React.useState("");
  const padRef = React.useRef<SignatureCanvas | null>(null);

  const capture = () => {
    const pad = padRef.current;
    setDataUrl(pad && !pad.isEmpty() ? pad.toDataURL("image/png") : "");
  };

  const clear = () => {
    padRef.current?.clear();
    setDataUrl("");
  };

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={estimateId} />
      <input type="hidden" name="signature" value={dataUrl} />

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-[13px] leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </p>
      ) : null}

      {variant === "full" && signing ? (
        <div className="rounded-xl border border-border-strong bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-foreground">
              Sign here (optional)
            </span>
            <button
              type="button"
              onClick={clear}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 rounded-lg border border-border bg-white p-1">
            <SignatureCanvas
              ref={padRef}
              penColor="#1c1a17"
              onEnd={capture}
              canvasProps={{
                className: "block h-[150px] w-full touch-none rounded-md",
                "aria-label": "Signature pad",
              }}
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Sign with a finger, stylus or mouse — or just approve without
            signing.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "flex gap-2.5",
          variant === "full" ? "flex-col sm:flex-row" : "flex-row",
        )}
      >
        {variant === "full" && !signing ? (
          <button
            type="button"
            onClick={() => setSigning(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-[14px] font-semibold text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SignatureIcon className="size-4" aria-hidden />
            Add a signature
          </button>
        ) : null}

        <DecisionButton
          decision="approve"
          className="bg-status-resolved text-white hover:brightness-95"
        >
          <ApproveIcon className="size-4" aria-hidden />
          Approve this estimate
        </DecisionButton>

        <DecisionButton
          decision="decline"
          className="border border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <DeclineIcon className="size-4" aria-hidden />
          Decline
        </DecisionButton>
      </div>
    </form>
  );
}

/**
 * The chosen answer travels as the submitter's own name/value, so one form can
 * carry both outcomes without a hidden field that could get out of sync.
 */
function DecisionButton({
  decision,
  className,
  children,
}: {
  decision: "approve" | "decline";
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-60" +' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  );
}
