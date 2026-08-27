"use client";

import { useActionState } from "react";

import { signupAction, type AuthFormState } from "../actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";

export function SignupForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signupAction,
    undefined
  );

  return (
    <form action={formAction} className="space-y-5">
      <ErrorBanner message={state?.error} />

      <Field
        label="Shop name"
        name="shopName"
        autoComplete="organization"
        placeholder="Downtown Device Repair"
      />
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        placeholder="Alex Rivera"
      />
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
        autoComplete="new-password"
        placeholder="At least 8 characters"
        minLength={8}
      />

      <SubmitButton pendingLabel="Creating your shop…">
        Create shop
      </SubmitButton>
    </form>
  );
}
