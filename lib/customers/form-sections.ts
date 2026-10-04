import type { TaxRateOption } from "@/lib/tax";

/**
 * The customer form's optional sections hide their fields behind a switch, and
 * a hidden field posts nothing. On an EXISTING customer that would read as
 * "blank" and wipe what is stored, so the form posts the stored values of every
 * switched-off section instead. Only emptying the fields while the section is
 * showing clears them.
 */
export function keptFields<S extends string, K extends string>(
  sections: Record<S, readonly K[]>,
  open: Record<S, boolean>,
  values: Record<K, string | null>,
): { name: K; value: string }[] {
  return (Object.keys(sections) as S[])
    .filter((section) => !open[section])
    .flatMap((section) => sections[section])
    .map((name) => ({ name, value: values[name] ?? "" }));
}

// ---------------------------------------------------------------------------
// What the form holds, and which optional section each field belongs to.
// Shared by the full form and the Easy-mode quick add, so both decide the same
// way what starts open and what a closed section posts.
// ---------------------------------------------------------------------------

export type CustomerFormValues = {
  id: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  referredBy: string | null;
  notes: string | null;
  smsOptIn: boolean;
  emailOptIn: boolean;
  taxExempt: boolean;
  taxRateId: string | null;
};

export type TextKey =
  | "name"
  | "businessName"
  | "email"
  | "phone"
  | "mobile"
  | "address1"
  | "address2"
  | "city"
  | "state"
  | "postalCode"
  | "referredBy"
  | "notes";

export type Values = Record<TextKey, string> & {
  smsOptIn: boolean;
  emailOptIn: boolean;
  taxExempt: boolean;
  taxRateId: string | null;
};

export type Section = "email" | "address" | "business" | "notes" | "tax";

export const SECTIONS: readonly Section[] = ["email", "address", "business", "notes", "tax"];

export const SECTION_FIELDS: Record<Section, (TextKey | "taxRateId")[]> = {
  email: ["email"],
  address: ["address1", "address2", "city", "state", "postalCode"],
  business: ["businessName", "phone"],
  notes: ["notes", "referredBy"],
  tax: ["taxRateId"],
};

export function initialValues(customer?: CustomerFormValues | null): Values {
  // A phone-only customer is stored as "Customer <number>"; show the name box empty.
  const phoneOnly = customer?.firstName === "Customer" && customer.lastName === (customer.mobile ?? customer.phone ?? "");
  return {
    name: customer && !phoneOnly ? `${customer.firstName} ${customer.lastName}`.trim() : "",
    businessName: customer?.businessName ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    mobile: customer?.mobile ?? "",
    address1: customer?.address1 ?? "",
    address2: customer?.address2 ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    postalCode: customer?.postalCode ?? "",
    referredBy: customer?.referredBy ?? "",
    notes: customer?.notes ?? "",
    smsOptIn: customer?.smsOptIn ?? false,
    emailOptIn: customer?.emailOptIn ?? true,
    taxExempt: customer?.taxExempt ?? false,
    taxRateId: customer?.taxRateId ?? null,
  };
}

/** Sections start switched on only when the customer already has something in them. */
export function initialSections(v: Values): Record<Section, boolean> {
  return {
    email: Boolean(v.email),
    address: Boolean(v.address1 || v.address2 || v.city || v.state || v.postalCode),
    business: Boolean(v.businessName || v.phone),
    notes: Boolean(v.notes || v.referredBy),
    tax: v.taxExempt || Boolean(v.taxRateId),
  };
}

/** A section with a validation error is always shown, even if it was switched off. */
export function openSections(
  chosen: Record<Section, boolean>,
  errors: Record<string, string | undefined>,
): Record<Section, boolean> {
  return Object.fromEntries(
    SECTIONS.map((section) => [section, chosen[section] || SECTION_FIELDS[section].some((key) => errors[key])]),
  ) as Record<Section, boolean>;
}

/** "Text updates" follows the mobile box (a real-looking number turns it on) until a person flips it by hand. */
export function textsFollowNumber(mobile: string): boolean {
  return mobile.replace(/\D/g, "").length >= 7;
}

// ---------------------------------------------------------------------------
// The Easy-mode quick add: what to show while the form is being filled in.
// ---------------------------------------------------------------------------

/**
 * Who the picture and the summary call this customer. A typed name wins; with
 * only a number it is "Customer <number>", which is exactly how the shop will
 * list a phone-only customer once saved. Empty until either is typed.
 */
export function displayName(v: Pick<Values, "name" | "mobile">): string {
  const name = v.name.trim().split(/\s+/).filter(Boolean).join(" ");
  if (name) return name;
  const mobile = v.mobile.trim();
  return mobile ? `Customer ${mobile}` : "";
}

/** The save rule the server enforces, mirrored only to word a hint: a name or a number is enough. */
export function hasNameOrNumber(v: Pick<Values, "name" | "mobile" | "phone">, officePhoneCounts: boolean): boolean {
  return Boolean(v.name.trim() || v.mobile.trim() || (officePhoneCounts && v.phone.trim()));
}

export type SummaryRow = { label: string; value: string };

function joined(parts: string[], separator: string): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}

/**
 * The rows under "This customer" (the name and number sit above them, beside
 * the picture): the text-update state and one row per optional section that is
 * switched on. A section that is off adds no row. A row with nothing in it yet
 * has an empty value, so the screen can say "Not added" in its own words.
 */
export function summaryRows(
  v: Values,
  open: Record<Section, boolean>,
  taxRates: readonly TaxRateOption[] = [],
): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Text updates", value: v.smsOptIn ? "On" : "Off" }];
  if (open.email) rows.push({ label: "Email", value: v.email.trim() });
  if (open.address) {
    rows.push({ label: "Address", value: joined([v.address1, v.address2, joined([v.city, v.state, v.postalCode], " ")], ", ") });
  }
  if (open.business) rows.push({ label: "Business", value: joined([v.businessName, v.phone], " · ") });
  if (open.notes) rows.push({ label: "Notes", value: joined([v.notes, v.referredBy], " · ") });
  if (open.tax) {
    const rate = v.taxRateId ? taxRates.find((candidate) => candidate.id === v.taxRateId) : undefined;
    rows.push({ label: "Tax", value: v.taxExempt ? "Tax exempt" : rate ? rate.name : "Shop default" });
  }
  return rows;
}
