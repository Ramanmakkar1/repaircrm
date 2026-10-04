"use client";

import * as React from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton as UiSubmitButton } from "@/components/ui/submit-button";

/**
 * Small shared bits for the auth forms.
 *
 * These are the house primitives, not lookalikes: `Input`, `Label` and `Button`
 * from components/ui, at the public touch size (48px, 16px type so a phone
 * does not zoom in on focus), because an auth card is a single-purpose screen
 * used on phones and counter tablets.
 */

/** 48px at 16px type: the public touch size. */
const AUTH_CONTROL = "h-12 text-base";

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  required = true,
  defaultValue,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  minLength?: number;
}) {
  if (type === "password") {
    return (
      <PasswordField
        label={label}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-[15px]">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        className={AUTH_CONTROL}
      />
    </div>
  );
}

/** A password box with a 48px Show / Hide button, so a long password can be checked before it is sent. */
export function PasswordField({
  label,
  name,
  autoComplete,
  placeholder,
  required = true,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-[15px]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className={`${AUTH_CONTROL} pr-24`}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          aria-controls={name}
          className="absolute inset-y-0 right-0 flex min-w-20 items-center justify-center gap-1.5 rounded-r-md px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {shown ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

/** The one-line code box on the two-step screen: same control, monospaced. */
export function CodeField({
  label,
  name,
  placeholder,
  autoComplete,
  maxLength,
  inputMode = "text",
  pattern,
}: {
  label: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric";
  pattern?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-[15px]">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="text"
        inputMode={inputMode}
        pattern={pattern}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        maxLength={maxLength}
        autoFocus
        className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
      />
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/**
 * The house submit button at the public 48px size. It wraps the shared one
 * rather than re-reading `useFormStatus` here, so these forms get the same
 * spinner as every other form in the app instead of a silently disabled button.
 */
export function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  return (
    <UiSubmitButton size="lg" pendingLabel={pendingLabel} className="h-12 min-h-12 w-full text-[15px]">
      {children}
    </UiSubmitButton>
  );
}
