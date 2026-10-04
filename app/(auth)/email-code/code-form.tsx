"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { EmailCodePurpose } from "@/lib/email-code";
import { CodeField, ErrorBanner, Field, SubmitButton } from "../form-parts";
import { emailCodeAction, type CodeState } from "./actions";

/**
 * Two screens in one form: the email box, then the 6-digit code box. The code
 * box is the shared CodeField (theme colours, focus-visible ring), not a
 * hard-coded white input that went blank in dark mode.
 */
export function EmailCodeForm({ purpose }: { purpose: EmailCodePurpose }) {
  const [state, action, pending] = useActionState(emailCodeAction.bind(null, purpose), {} as CodeState);
  return (
    <form action={action} className="space-y-5">
      <ErrorBanner message={state.error} />
      {state.challenge ? (
        <>
          <p className="text-[15px] leading-relaxed text-muted-foreground" role="status">
            If an account uses <strong className="text-foreground">{state.email}</strong>, a 6-digit code is on its way. Check your inbox and
            your spam folder.
          </p>
          <CodeField
            label="6-digit code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
          />
          <SubmitButton pendingLabel="Checking the code…">
            {purpose === "login" ? "Sign in" : "Continue to reset password"}
          </SubmitButton>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            A code works for 10 minutes. You can ask for a new one after a minute.
          </p>
          <Button
            type="submit"
            name="action"
            value="resend"
            formNoValidate
            disabled={pending}
            variant="outline"
            size="lg"
            className="h-12 min-h-12 w-full text-[15px]"
          >
            Send me a new code
          </Button>
        </>
      ) : (
        <>
          <Field name="email" type="email" label="Email address" autoComplete="email" placeholder="you@yourshop.com" />
          <SubmitButton pendingLabel="Sending the code…">Email me a code</SubmitButton>
        </>
      )}
    </form>
  );
}
