"use client";

import { useFormStatus } from "react-dom";

/**
 * Small shared bits for the auth forms. Deliberately plain Tailwind — the
 * design agent will restyle these later.
 */

export const fieldClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface px-3.5 text-[15px] text-foreground shadow-xs outline-none transition placeholder:text-faint-foreground focus:border-accent focus:ring-[3px] focus:ring-ring/20 disabled:opacity-60";

export const labelClass = "block text-sm font-semibold text-foreground";

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
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        className={fieldClass}
      />
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-[14.5px] font-medium text-destructive"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-md bg-accent px-4 text-[15px] font-semibold text-accent-foreground shadow-xs transition hover:bg-accent-hover hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
