"use client";
import { useActionState } from "react";
import { emailCodeAction, type CodeState } from "./actions";
import { ErrorBanner, Field, SubmitButton } from "../form-parts";
import type { EmailCodePurpose } from "@/lib/email-code";

export function EmailCodeForm({ purpose }: { purpose: EmailCodePurpose }) {
  const [state, action, pending] = useActionState(emailCodeAction.bind(null, purpose), {} as CodeState);
  return <form action={action} className="space-y-5">
    <ErrorBanner message={state.error} />
    {state.challenge ? <>
      <p className="text-sm leading-relaxed text-muted-foreground" role="status">If an active account uses <strong className="text-foreground">{state.email}</strong>, we’ll email a 6-digit code. Check your inbox and spam folder.</p>
      <label className="block text-sm font-medium" htmlFor="email-code">6-digit code</label>
      <input id="email-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required className="h-12 w-full rounded-md border border-border bg-white px-4 text-xl tracking-[.4em] focus:ring-2 focus:ring-ring" />
      <SubmitButton pendingLabel="Checking code…">{purpose === "login" ? "Sign in" : "Continue to reset password"}</SubmitButton>
      <p className="text-xs leading-relaxed text-muted-foreground">Codes expire after 10 minutes. Wait at least one minute before requesting another code.</p>
      <button type="submit" name="action" value="resend" formNoValidate disabled={pending} className="text-sm font-medium underline underline-offset-4 disabled:opacity-50">Send a new code</button>
    </> : <>
      <Field name="email" type="email" label="Email address" autoComplete="email" placeholder="you@yourshop.com" />
      <SubmitButton pendingLabel="Requesting code…">Email me a code</SubmitButton>
    </>}
  </form>;
}
