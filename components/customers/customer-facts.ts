import { formatCents } from "@/lib/money";
import { shortDateIn } from "@/lib/shop-time";
import { plural } from "./format";

/**
 * Pure rules behind the Easy mode customer screens: what a card says about
 * someone, which number is "their" number, and how a number becomes a link
 * you can tap to call. No React, no db: shared by the list, the detail header
 * and the tests.
 */

export type CustomerFact = {
  key: "open" | "owed" | "visit";
  /** Always words: "2 open repairs", "$120.00 owed", "Last visit Sep 30". */
  label: string;
  /** `alert` only adds emphasis (money owed); the words carry the meaning. */
  tone: "neutral" | "alert";
};

/**
 * The (at most three) small facts on a customer card, each only when true.
 * Nothing open, nothing owed and no visit on record gives an empty list, so a
 * brand-new customer shows a clean card instead of three zeros.
 */
export function customerFacts({
  openRepairs,
  owedCents,
  lastVisit,
  now = new Date(),
  timeZone,
}: {
  openRepairs: number;
  owedCents: number;
  lastVisit: Date | null | undefined;
  now?: Date;
  /** The shop's time zone (Shop.timezone): the visit is dated on the shop's calendar. */
  timeZone?: string | null;
}): CustomerFact[] {
  const facts: CustomerFact[] = [];

  if (openRepairs > 0) {
    facts.push({ key: "open", label: plural(openRepairs, "open repair"), tone: "neutral" });
  }
  if (owedCents > 0) {
    facts.push({ key: "owed", label: `${formatCents(owedCents)} owed`, tone: "alert" });
  }
  if (lastVisit && !Number.isNaN(lastVisit.getTime())) {
    // "Sep 30" this year; "Sep 30, 2025" once the year differs, so an old
    // visit never reads as a recent one.
    facts.push({
      key: "visit",
      label: `Last visit ${shortDateIn(lastVisit, now.getTime(), timeZone)}`,
      tone: "neutral",
    });
  }

  return facts;
}

/**
 * The number the page shows and edits as "their phone": the mobile when there
 * is one (the counter form saves the main number there) or when neither number
 * is set, otherwise the office phone. A customer with only one number never
 * reads empty. The header's inline editor and the tap-to-call link both come
 * from this, so what is dialled is what is edited.
 */
export function primaryPhone(customer: { phone: string | null; mobile: string | null }): {
  field: "mobile" | "phone";
  label: "Mobile" | "Phone";
  value: string;
} {
  const useMobile = Boolean(customer.mobile) || !customer.phone;
  return useMobile
    ? { field: "mobile", label: "Mobile", value: customer.mobile ?? "" }
    : { field: "phone", label: "Phone", value: customer.phone ?? "" };
}

/** "(512) 555-0178" -> "tel:5125550178". Keeps a leading + and digits only. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** "(512) 555-0178" -> "sms:5125550178": opens the device's messaging app on a new text. */
export function smsHref(phone: string): string {
  return telHref(phone).replace(/^tel:/, "sms:");
}

/**
 * Quick-added customers (a number typed at the counter, no name) are stored as
 * "Customer 5125550199". Initials of that read "C5", so the card shows a
 * person icon for them instead.
 */
export function isPlaceholderName(name: string): boolean {
  return /^customer\s+[\d\s()+.-]+$/i.test(name.trim());
}
