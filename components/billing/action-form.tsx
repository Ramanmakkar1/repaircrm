"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { useDialogOpen, type ControlledDialog } from "./dialog-open";

/**
 * A one-button form for the simple status transitions (Mark sent, Approve,
 * Decline, Convert). The server action is passed straight through as the form
 * action — the button exists only so `useFormStatus` has a form to report on.
 */
export function ActionForm({
  action,
  fields,
  children,
  variant,
  size,
  disabled,
  pendingLabel,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  pendingLabel?: string;
  className?: string;
}) {
  return (
    <form action={action} className={className}>
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        disabled={disabled}
        pendingLabel={pendingLabel}
      >
        {children}
      </SubmitButton>
    </form>
  );
}

/**
 * Same, behind a confirmation step. Used for destructive, irreversible actions
 * (voiding an invoice) where a stray click would be expensive.
 */
export function ConfirmActionDialog({
  action,
  fields,
  open: openProp,
  onOpenChange,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize,
  triggerIcon,
  title,
  description,
  confirmLabel,
  confirmVariant = "destructive",
  disabled,
  disabledReason,
}: ControlledDialog & {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
  /** Detail-page action rows run at `sm`; everywhere else keeps the default. */
  triggerSize?: ButtonProps["size"];
  triggerIcon?: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: ButtonProps["variant"];
  disabled?: boolean;
  /** Rendered as the button's tooltip/title when it is blocked. */
  disabledReason?: string;
}) {
  const { open, setOpen, controlled } = useDialogOpen({
    open: openProp,
    onOpenChange,
  });

  if (disabled) {
    // Driven from a menu, the caller renders its own disabled item carrying the
    // same reason — a dead button here would be a second copy of it.
    return controlled ? null : (
      <Button variant={triggerVariant} size={triggerSize} disabled title={disabledReason}>
        {triggerIcon}
        {triggerLabel}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlled ? null : (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize}>
            {triggerIcon}
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          {Object.entries(fields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant={confirmVariant} pendingLabel="Working…">
              {confirmLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
