"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { deleteBlockedReason } from "@/components/customers/format";
import { audit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emitCustomerEvent } from "@/lib/events";

/**
 * Server actions for the Customers module.
 *
 * MULTI-TENANCY: every action resolves `shopId` from the session and either
 * filters on it directly (Customer, Asset — both carry `shopId`) or reaches the
 * row through an already-scoped parent (Contact, via `customer: { shopId }`).
 * A shopId is never read from the wire.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Result shape for the dialog/inline actions the client awaits directly. */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** `useActionState` shape for the full-page customer form. */
export type CustomerFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
    }
  | undefined;

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Trimmed string, or undefined when the field was blank/absent. */
function text(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Radix Switch / native checkbox submit "on" only when checked. */
function flag(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Customer create / update
// ---------------------------------------------------------------------------

const customerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().min(1, "Last name is required").max(80),
  businessName: z.string().max(120).optional(),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().max(40).optional(),
  mobile: z.string().max(40).optional(),
  address1: z.string().max(160).optional(),
  address2: z.string().max(160).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(60).optional(),
  referredBy: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
  smsOptIn: z.boolean(),
  emailOptIn: z.boolean(),
  taxExempt: z.boolean(),
  /** A TaxRate id, verified against this shop before it is stored. */
  taxRateId: z.string().max(40).optional(),
});

type CustomerInput = z.infer<typeof customerSchema>;

function readCustomer(formData: FormData) {
  return {
    firstName: text(formData, "firstName") ?? "",
    lastName: text(formData, "lastName") ?? "",
    businessName: text(formData, "businessName"),
    email: text(formData, "email")?.toLowerCase(),
    phone: text(formData, "phone"),
    mobile: text(formData, "mobile"),
    address1: text(formData, "address1"),
    address2: text(formData, "address2"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country"),
    referredBy: text(formData, "referredBy"),
    notes: text(formData, "notes"),
    smsOptIn: flag(formData, "smsOptIn"),
    emailOptIn: flag(formData, "emailOptIn"),
    taxExempt: flag(formData, "taxExempt"),
    // Radix Select cannot hold an empty value, so "none" is the null sentinel.
    taxRateId:
      text(formData, "taxRateId") === "none"
        ? undefined
        : text(formData, "taxRateId"),
  };
}

/**
 * A tax rate id is only stored once it is confirmed to belong to this shop —
 * otherwise a forged value would pin a customer to another tenant's rate.
 * An exempt customer keeps no rate at all: 0% is not a rate, it is the absence
 * of one.
 */
async function validTaxRateId(
  shopId: string,
  taxRateId: string | undefined,
  taxExempt: boolean,
): Promise<string | null> {
  if (taxExempt || !taxRateId) return null;
  const rate = await db.taxRate.findFirst({
    where: { id: taxRateId, shopId },
    select: { id: true },
  });
  return rate?.id ?? null;
}

/**
 * Explicit nulls for every optional column — on update, `undefined` means
 * "leave unchanged" in Prisma, which would make clearing a field impossible.
 */
function customerData(input: CustomerInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    businessName: input.businessName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    mobile: input.mobile ?? null,
    address1: input.address1 ?? null,
    address2: input.address2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? "US",
    referredBy: input.referredBy ?? null,
    notes: input.notes ?? null,
    smsOptIn: input.smsOptIn,
    emailOptIn: input.emailOptIn,
    taxExempt: input.taxExempt,
  };
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { shopId } = await requireUser();

  const parsed = customerSchema.safeParse(readCustomer(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const customer = await db.customer.create({
    data: {
      ...customerData(parsed.data),
      shopId,
      taxRateId: await validTaxRateId(
        shopId,
        parsed.data.taxRateId,
        parsed.data.taxExempt,
      ),
    },
    select: { id: true },
  });

  await emitCustomerEvent(shopId, "customer.created", customer.id);

  revalidatePath("/customers");
  // redirect() throws — must stay outside any try/catch.
  redirect(`/customers/${customer.id}?flash=created`);
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { shopId } = await requireUser();

  const id = text(formData, "id");
  if (!id) return { error: "Missing customer id." };

  const owned = await db.customer.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  if (!owned) return { error: "Customer not found." };

  const parsed = customerSchema.safeParse(readCustomer(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  await db.customer.update({
    where: { id },
    data: {
      ...customerData(parsed.data),
      taxRateId: await validTaxRateId(
        shopId,
        parsed.data.taxRateId,
        parsed.data.taxExempt,
      ),
    },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?flash=updated`);
}

// ---------------------------------------------------------------------------
// Inline notes
// ---------------------------------------------------------------------------

export async function saveCustomerNotesAction(
  customerId: string,
  notes: string,
): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const trimmed = notes.trim();
  if (trimmed.length > 5000) {
    return { ok: false, error: "Notes are limited to 5,000 characters." };
  }

  const updated = await db.customer.updateMany({
    where: { id: customerId, shopId },
    data: { notes: trimmed === "" ? null : trimmed },
  });
  if (updated.count === 0) return { ok: false, error: "Customer not found." };

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email address").max(160).optional(),
  phone: z.string().max(40).optional(),
  label: z.string().max(60).optional(),
});

function readContact(formData: FormData) {
  return {
    name: text(formData, "name") ?? "",
    email: text(formData, "email")?.toLowerCase(),
    phone: text(formData, "phone"),
    label: text(formData, "label"),
  };
}

export async function createContactAction(
  customerId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const parsed = contactSchema.safeParse(readContact(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const owned = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Customer not found." };

  await db.contact.create({
    data: {
      customerId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      label: parsed.data.label ?? null,
    },
  });

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function updateContactAction(
  contactId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const parsed = contactSchema.safeParse(readContact(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Contact has no shopId of its own — scope through its customer.
  const contact = await db.contact.findFirst({
    where: { id: contactId, customer: { shopId } },
    select: { id: true, customerId: true },
  });
  if (!contact) return { ok: false, error: "Contact not found." };

  await db.contact.update({
    where: { id: contactId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      label: parsed.data.label ?? null,
    },
  });

  revalidatePath(`/customers/${contact.customerId}`);
  return { ok: true };
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const contact = await db.contact.findFirst({
    where: { id: contactId, customer: { shopId } },
    select: { id: true, customerId: true },
  });
  if (!contact) return { ok: false, error: "Contact not found." };

  await db.contact.delete({ where: { id: contactId } });

  revalidatePath(`/customers/${contact.customerId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Assets (customer devices)
// ---------------------------------------------------------------------------

const assetSchema = z.object({
  type: z.string().min(1, "Device type is required").max(60),
  make: z.string().max(60).optional(),
  model: z.string().max(80).optional(),
  serial: z.string().max(80).optional(),
  password: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});

function readAsset(formData: FormData) {
  return {
    type: text(formData, "type") ?? "",
    make: text(formData, "make"),
    model: text(formData, "model"),
    serial: text(formData, "serial"),
    password: text(formData, "password"),
    notes: text(formData, "notes"),
  };
}

function assetData(input: z.infer<typeof assetSchema>) {
  return {
    type: input.type,
    make: input.make ?? null,
    model: input.model ?? null,
    serial: input.serial ?? null,
    password: input.password ?? null,
    notes: input.notes ?? null,
  };
}

export async function createAssetAction(
  customerId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const parsed = assetSchema.safeParse(readAsset(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const owned = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "Customer not found." };

  await db.asset.create({
    data: { ...assetData(parsed.data), customerId, shopId },
  });

  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function updateAssetAction(
  assetId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const parsed = assetSchema.safeParse(readAsset(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const asset = await db.asset.findFirst({
    where: { id: assetId, shopId },
    select: { id: true, customerId: true },
  });
  if (!asset) return { ok: false, error: "Device not found." };

  await db.asset.update({ where: { id: assetId }, data: assetData(parsed.data) });

  revalidatePath(`/customers/${asset.customerId}`);
  return { ok: true };
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  const { shopId } = await requireUser();

  const asset = await db.asset.findFirst({
    where: { id: assetId, shopId },
    select: { id: true, customerId: true, _count: { select: { tickets: true } } },
  });
  if (!asset) return { ok: false, error: "Device not found." };

  if (asset._count.tickets > 0) {
    return {
      ok: false,
      error: `This device is attached to ${asset._count.tickets} ticket${
        asset._count.tickets === 1 ? "" : "s"
      } and can't be deleted.`,
    };
  }

  await db.asset.delete({ where: { id: assetId } });

  revalidatePath(`/customers/${asset.customerId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete customer (OWNER only, and only when nothing references them)
// ---------------------------------------------------------------------------

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  // Hard role guard — redirects a non-owner rather than deleting.
  const { shopId, userId } = await requireRole("OWNER");

  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      _count: { select: { tickets: true, invoices: true, estimates: true } },
    },
  });
  if (!customer) return { ok: false, error: "Customer not found." };

  const blocked = deleteBlockedReason(customer._count);
  if (blocked) return { ok: false, error: blocked };

  // Contacts, assets, attachments, comms and portal tokens cascade from Customer.
  await db.customer.delete({ where: { id: customerId } });

  await audit({
    shopId,
    userId,
    action: "customer.deleted",
    entity: "customer",
    entityId: customerId,
    summary: `Deleted customer ${customer.firstName} ${customer.lastName}`,
  });

  revalidatePath("/customers");
  return { ok: true };
}
