/**
 * Shared, dependency-free lead vocabulary + display rules.
 *
 * Imported by BOTH server components and client components (and by the public
 * capture route), so this file must stay pure: no `db`, no `next/*`, no
 * "use server".
 */

import { format } from "date-fns";

import type { StatusTone } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CLOSED"] as const;
export type LeadStatusKey = (typeof LEAD_STATUSES)[number];

/**
 * Statuses that still need someone to do something. The inbox defaults to
 * these — a front desk opening /leads wants the work, not the archive.
 */
export const OPEN_LEAD_STATUSES: LeadStatusKey[] = ["NEW", "CONTACTED"];

/** The four lead states in the app-wide tone language (components/ui/badge.tsx). */
export const LEAD_STATUS_META: Record<
  LeadStatusKey,
  { label: string; tone: StatusTone }
> = {
  NEW: { label: "New", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "active" },
  CONVERTED: { label: "Converted", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export function asLeadStatus(value: unknown): LeadStatusKey {
  return LEAD_STATUSES.includes(value as LeadStatusKey)
    ? (value as LeadStatusKey)
    : "NEW";
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * The picker's options. `source` is a free-form column so the public capture
 * endpoint can file anything a shop's own form sends ("Facebook", "Yelp") —
 * these are just what the in-app form offers.
 */
export const LEAD_SOURCES = [
  "Walk-in",
  "Phone",
  "Website",
  "Referral",
  "Other",
] as const;

/** What the public endpoint stamps when the caller didn't say. */
export const DEFAULT_WEB_SOURCE = "Website";

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/** A lead newer than this, still untouched, gets the accent bar on the card. */
export const FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Compact relative age: "just now", "9m ago", "2h ago", "3d ago", then a date.
 *
 * Deliberately not date-fns `formatDistanceToNow` — that renders "about 2
 * hours ago", which is three words too long for a card corner.
 */
export function leadAge(date: Date, now: Date = new Date()): string {
  const ms = now.getTime() - date.getTime();
  if (ms < 60_000) return "just now";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  return format(date, "MMM d, yyyy");
}

/** A NEW lead less than a day old — the ones worth a coloured edge. */
export function isFreshLead(
  lead: { status: string; createdAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    lead.status === "NEW" && now.getTime() - lead.createdAt.getTime() < FRESH_MS
  );
}

// ---------------------------------------------------------------------------
// Name / contact helpers
// ---------------------------------------------------------------------------

/**
 * Splits a lead's single `name` field into the first/last a Customer needs.
 * One word means the whole thing is the first name — inventing a last name
 * ("—", "Unknown") would put junk on every future invoice.
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Lead", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/** Digits only, so "(512) 555-0110" and "512-555-0110" compare equal. */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * The last four digits, which are contiguous in every common phone format —
 * so they work as a cheap `contains` pre-filter in SQL before the full
 * normalised comparison happens in JS.
 */
export function phoneTail(value: string | null | undefined): string {
  const digits = normalizePhone(value);
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/** Two phone numbers are the same when their digits match, ignoring a country code. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (left.length < 7 || right.length < 7) return false;
  // Compare the last 10 digits so +1 512 555 0110 == (512) 555-0110.
  return left.slice(-10) === right.slice(-10);
}

/** Up to two uppercase initials, mirroring components/customers/format.ts. */
export function leadInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** First `max` characters of a message, single-spaced, with an ellipsis. */
export function messagePreview(body: string, max = 150): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * A sensible prefilled ticket subject: the first sentence of what the customer
 * wrote, falling back to their name. Staff edit it before saving anyway — this
 * only has to beat an empty box.
 */
export function ticketSubjectFromLead(lead: {
  name: string;
  message?: string | null;
}): string {
  const flat = (lead.message ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return `Repair enquiry — ${lead.name}`;
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  return sentence.length > 120 ? `${sentence.slice(0, 119)}…` : sentence;
}
