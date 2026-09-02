"use client";

import { useActionState } from "react";

import {
  verifyTwoFactorAction,
  type SecurityFormState,
} from "../../security-actions";
import { CodeField, ErrorBanner, SubmitButton } from "../../form-parts";

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

      <CodeField
        label="Code"
        name="code"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={20}
      />

      <SubmitButton pendingLabel="Checking…">Verify code</SubmitButton>
    </form>
  );
}
