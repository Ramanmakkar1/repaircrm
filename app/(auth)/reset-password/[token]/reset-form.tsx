"use client";

import { useActionState } from "react";

import {
  resetPasswordAction,
  type SecurityFormState,
} from "../../security-actions";
import { ErrorBanner, Field, SubmitButton } from "../../form-parts";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<SecurityFormState, FormData>(
    resetPasswordAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <ErrorBanner message={state?.error} />

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        minLength={8}
      />

      <SubmitButton pendingLabel="Saving…">Save and sign in</SubmitButton>
    </form>
  );
}
