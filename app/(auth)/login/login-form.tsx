"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthFormState } from "../actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    loginAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {state?.shopDeletionPending ? (
        <div role="alert" className="space-y-2 rounded-md border border-border bg-surface px-4 py-3 text-[15px]">
          <p className="font-medium text-foreground">{state.error}</p>
          <Link
            href="/delete-account#keep"
            className="inline-flex min-h-12 items-center font-semibold text-accent-soft-foreground underline-offset-4 hover:underline"
          >
            Keep my shop
          </Link>
        </div>
      ) : (
        <ErrorBanner message={state?.error} />
      )}

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
