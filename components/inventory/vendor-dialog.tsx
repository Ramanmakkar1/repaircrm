"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import {
  createVendorAction,
  updateVendorAction,
  type VendorActionState,
} from "@/app/(app)/inventory/vendors/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/cn";

export type VendorFormValues = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  accountNumber: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

const EMPTY: VendorActionState = {};

/**
 * Add or edit a vendor.
 *
 * A dialog rather than a page: a vendor is eight short fields, and the buyer
 * reaching for "new vendor" is usually part-way through raising an order —
 * bouncing them to another route and back would lose that thread.
 *
 * Fields are controlled so a validation failure doesn't blank the form (React
 * resets `<form action={…}>` once the action settles).
 */
export function VendorDialog({
  vendor,
  trigger,
}: {
  vendor?: VendorFormValues | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const isEdit = Boolean(vendor);

  const [values, setValues] = React.useState(() => initial(vendor));
  const set = (key: keyof ReturnType<typeof initial>, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const [state, formAction] = useActionState(
    async (
      previous: VendorActionState,
      formData: FormData,
    ): Promise<VendorActionState> => {
      const result = vendor
        ? await updateVendorAction(vendor.id, previous, formData)
        : await createVendorAction(previous, formData);
      if (result.ok) {
        setOpen(false);
        toast.success(isEdit ? "Vendor updated." : "Vendor added.");
        if (!isEdit) setValues(initial(null));
      }
      return result;
    },
    EMPTY,
  );

  const errors = state.fieldErrors ?? {};

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reseed on open so a cancelled edit is genuinely forgotten.
        if (next) setValues(initial(vendor));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vendor" : "New vendor"}</DialogTitle>
          <DialogDescription>
            Who the shop buys parts from. Only the name is required.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="active" value={vendor ? String(vendor.active) : "true"} />

          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <Field label="Name" htmlFor="vendor-name" required error={errors.name}>
            <Input
              id="vendor-name"
              name="name"
              autoFocus
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Mobile Sentrix"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="vendor-email" error={errors.email}>
              <Input
                id="vendor-email"
                name="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
                placeholder="orders@vendor.com"
                aria-invalid={Boolean(errors.email)}
              />
            </Field>

            <Field label="Phone" htmlFor="vendor-phone" error={errors.phone}>
              <Input
                id="vendor-phone"
                name="phone"
                value={values.phone}
                onChange={(event) => set("phone", event.target.value)}
                placeholder="(555) 010-2233"
              />
            </Field>

            <Field label="Website" htmlFor="vendor-website" error={errors.website}>
              <Input
                id="vendor-website"
                name="website"
                value={values.website}
                onChange={(event) => set("website", event.target.value)}
                placeholder="vendor.com"
              />
            </Field>

            <Field
              label="Account number"
              htmlFor="vendor-account"
              error={errors.accountNumber}
            >
              <Input
                id="vendor-account"
                name="accountNumber"
                className="font-mono"
                value={values.accountNumber}
                onChange={(event) => set("accountNumber", event.target.value)}
                placeholder="RF-40122"
              />
            </Field>
          </div>

          <Field label="Address" htmlFor="vendor-address" error={errors.address}>
            <Textarea
              id="vendor-address"
              name="address"
              rows={2}
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              placeholder="410 Industry Way, Suite 3&#10;Dallas, TX 75201"
            />
          </Field>

          <Field label="Notes" htmlFor="vendor-notes" error={errors.notes}>
            <Textarea
              id="vendor-notes"
              name="notes"
              rows={2}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Free shipping over $250. Rep: Dana."
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">
              {isEdit ? "Save vendor" : "Add vendor"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function initial(vendor?: VendorFormValues | null) {
  return {
    name: vendor?.name ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    website: vendor?.website ?? "",
    accountNumber: vendor?.accountNumber ?? "",
    address: vendor?.address ?? "",
    notes: vendor?.notes ?? "",
  };
}

function Field({
  label,
  htmlFor,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
