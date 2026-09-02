"use client";

import { useActionState } from "react";

import {
  verifyTwoFactorAction,
  type SecurityFormState,
} from "../../security-actions";
import { ErrorBanner, SubmitButton, fieldClass, labelClass } from "../../form-parts";

/**
 * One field, deliberately. A recovery code goes in the same box as a 6-digit
 * code — the server can tell them apart, and a second input would only make a
 * person choose before they know which one they have.
 */
export function VerifyForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<SecurityFormState, FormData>(
    verifyTwoFactorAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <ErrorBanner message={state?.error} />

      <div className="space-y-2">
        <label className={labelClass} htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          placeholder="123456"
          required
          maxLength={20}
          autoFocus
          className={`${fieldClass} font-mono tracking-[0.3em]`}
        />
      </div>

      <SubmitButton pendingLabel="Checking…">Verify</SubmitButton>
    </form>
  );
}
