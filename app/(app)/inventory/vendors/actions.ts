"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Vendor book mutations.
 *
 * ROLE: purchasing is OWNER-only, for the same reason `costCents` is hidden
 * from other roles on the product form — a vendor record and the purchase
 * orders hanging off it are the shop's buying prices. `requireRole` would
 * redirect, which is wrong for a dialog awaiting JSON, so the guard here
 * answers with a message instead.
 *
 * MULTI-TENANCY: `shopId` comes from the session and never from the form, and
 * every update is scoped by `{ id, shopId }` so a forged id matches nothing.
 */

export type VendorActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const OWNER_ONLY = "Only an owner can manage vendors.";

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(160),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address")])
    .transform((value) => (value === "" ? null : value.toLowerCase())),
  phone: z.string().trim().max(40).transform(nullIfBlank),
  website: z.string().trim().max(200).transform(nullIfBlank),
  accountNumber: z.string().trim().max(80).transform(nullIfBlank),
  address: z.string().trim().max(400).transform(nullIfBlank),
  notes: z.string().trim().max(2000).transform(nullIfBlank),
  active: z.boolean(),
});

function nullIfBlank(value: string): string | null {
  return value === "" ? null : value;
}

function field(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function readVendor(formData: FormData) {
  return {
    name: field(formData, "name"),
    email: field(formData, "email").toLowerCase(),
    phone: field(formData, "phone"),
    website: field(formData, "website"),
    accountNumber: field(formData, "accountNumber"),
    address: field(formData, "address"),
    notes: field(formData, "notes"),
    active: formData.get("active") !== "false",
  };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

function revalidateVendors(vendorId?: string): void {
  revalidatePath("/inventory/vendors");
  revalidatePath("/inventory/purchase-orders");
  if (vendorId) revalidatePath(`/inventory/vendors/${vendorId}`);
}

export async function createVendorAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const parsed = vendorSchema.safeParse(readVendor(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  await db.vendor.create({ data: { shopId, ...parsed.data } });
  revalidateVendors();
  return { ok: true };
}

export async function updateVendorAction(
  vendorId: string,
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const parsed = vendorSchema.safeParse(readVendor(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const updated = await db.vendor.updateMany({
    where: { id: vendorId, shopId },
    data: parsed.data,
  });
  if (updated.count === 0) return { error: "Vendor not found." };

  revalidateVendors(vendorId);
  return { ok: true };
}

/**
 * Deactivate / reactivate.
 *
 * A vendor is never deleted: purchase orders reference it with
 * `onDelete: Restrict`, and a shop's buying history is exactly the thing you do
 * not want disappearing because somebody tidied the list. Inactive just means
 * "stop offering this one when raising a new order".
 */
export async function setVendorActiveAction(
  vendorId: string,
  active: boolean,
): Promise<VendorActionState> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { error: OWNER_ONLY };

  const updated = await db.vendor.updateMany({
    where: { id: vendorId, shopId },
    data: { active },
  });
  if (updated.count === 0) return { error: "Vendor not found." };

  revalidateVendors(vendorId);
  return { ok: true };
}
