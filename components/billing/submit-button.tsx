"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";

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
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
