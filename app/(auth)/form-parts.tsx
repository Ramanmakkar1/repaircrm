"use client";

import { AlertCircle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton as UiSubmitButton } from "@/components/ui/submit-button";

/**
 * Small shared bits for the auth forms.
 *
 * These are the house primitives, not lookalikes: `Input`, `Label` and `Button`
 * from components/ui, nudged one step up in size because an auth card is a
 * single-purpose screen with four controls on it, not a dense working page. The
 * hand-rolled copies that used to live here drifted from the primitives on
 * focus behaviour — `focus:` rather than `focus-visible:` — which is exactly
 * the kind of thing a shared component exists to stop happening.
 */

/** 44px rather than the app's 40px, at the 15px body scale. */
const AUTH_CONTROL = "h-11 text-[15px]";

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
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
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

/** The one-line code box on the two-step screen — same control, monospaced. */
export function CodeField({
  label,
  name,
  placeholder,
  autoComplete,
  maxLength,
}: {
  label: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="text"
        inputMode="text"
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        maxLength={maxLength}
        autoFocus
        className={`${AUTH_CONTROL} font-mono tracking-[0.3em]`}
      />
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-[14.5px] font-medium text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * The house submit button at auth size. It wraps the shared one rather than
 * re-reading `useFormStatus` here, so these forms get the same spinner as every
 * other form in the app instead of a silently disabled button.
 */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  return (
    <UiSubmitButton size="lg" pendingLabel={pendingLabel} className="w-full">
      {children}
    </UiSubmitButton>
  );
}
