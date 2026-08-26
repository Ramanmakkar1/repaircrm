import { format } from "date-fns";

/**
 * Presentation helpers shared by every customer view.
 *
 * Kept here (not in lib/) because the Customers module owns them; other modules
 * are welcome to import `fullName` / `customerLabel` for pickers and headers.
 */

export const EM_DASH = "—";

export type CustomerNameParts = {
  firstName: string;
  lastName: string;
  businessName?: string | null;
};

/** "Elena Marquez" */
export function fullName(c: CustomerNameParts): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

/** Business name when the customer is a company, otherwise the person's name. */
export function customerLabel(c: CustomerNameParts): string {
  const business = c.businessName?.trim();
  return business || fullName(c);
}

/**
 * Up to two uppercase initials.
 *
 * Mirrors `getInitials` from components/ui/avatar.tsx, which lives in a
 * `"use client"` module and therefore cannot be *called* during a server
 * render — only rendered as a component. Server pages use this instead.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy") : EM_DASH;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy · h:mm a") : EM_DASH;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export type AddressParts = {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

/** Address as display lines; empty array when nothing was captured. */
export function addressLines(a: AddressParts): string[] {
  const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter((part) => part && part.trim())
    .join(", ");

  return [
    a.address1,
    a.address2,
    cityLine,
    a.country && a.country !== "US" ? a.country : null,
  ]
    .map((line) => (line ?? "").trim())
    .filter(Boolean);
}

/** "iPhone 14 Pro" from make + model, falling back to the device type. */
export function assetLabel(a: {
  type: string;
  make?: string | null;
  model?: string | null;
}): string {
  const parts = [a.make, a.model].filter(Boolean).join(" ").trim();
  return parts || a.type;
}

/** Title-cases an enum value: PARTIAL -> "Partial", WAITING_ON -> "Waiting On". */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Why a customer can't be deleted, or null when deletion is allowed.
 * Lives here rather than in actions.ts because a `"use server"` module may only
 * export async functions — and both the page and the action need this rule.
 */
export function deleteBlockedReason(counts: {
  tickets: number;
  invoices: number;
  estimates: number;
}): string | null {
  const parts: string[] = [];
  if (counts.tickets) parts.push(plural(counts.tickets, "ticket"));
  if (counts.invoices) parts.push(plural(counts.invoices, "invoice"));
  if (counts.estimates) parts.push(plural(counts.estimates, "estimate"));
  if (parts.length === 0) return null;
  return `This customer has ${listOut(parts)}. Delete or reassign those records first.`;
}

export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function listOut(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** First `max` characters of a body, single-spaced, with an ellipsis. */
export function preview(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
