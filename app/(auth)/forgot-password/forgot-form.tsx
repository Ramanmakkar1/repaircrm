"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import {
  forgotPasswordAction,
  type SecurityFormState,
} from "../security-actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";

/**
 * Success is a dead end on purpose: once the reply is showing, the form is
 * replaced rather than left ready to fire again. The reply is the same whether
 * or not the address exists, so there is nothing to learn by resubmitting.
 */
export function ForgotForm() {
  const [state, formAction] = useActionState<SecurityFormState, FormData>(
    forgotPasswordAction,
    undefined,
  );

  if (state?.message) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface-hover px-5 py-7 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft">
          <MailCheck className="size-6 text-accent-soft-foreground" />
        </span>
        <p className="text-[15px] leading-relaxed text-foreground">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <ErrorBanner message={state?.error} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@shop.com"
      />

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
