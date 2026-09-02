"use client";

import { useActionState } from "react";

import {
  forcedPasswordChangeAction,
  type SecurityFormState,
} from "../security-actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<SecurityFormState, FormData>(
    forcedPasswordChangeAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5">
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

      <SubmitButton pendingLabel="Saving…">Save password</SubmitButton>

      <p className="text-center text-[14px] text-muted-foreground">
        <a
          href="/logout"
          className="font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Sign out instead
        </a>
      </p>
    </form>
  );
}
