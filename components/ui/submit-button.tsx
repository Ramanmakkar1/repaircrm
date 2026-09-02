"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "./button";

/**
 * A submit button that disables itself and shows a spinner while its enclosing
 * form is in flight. Lives in its own component because `useFormStatus` only
 * reports the status of a form *above* it in the tree.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    // `disabled` after the spread, not before: a caller passing an explicit
    // `disabled={false}` would otherwise re-enable the button mid-flight and
    // hand the user a second submit.
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
