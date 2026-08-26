"use client";

import { useActionState } from "react";

import { loginAction, type AuthFormState } from "../actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    loginAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <ErrorBanner message={state?.error} />

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@shop.com"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
      />

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
