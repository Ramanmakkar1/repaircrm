import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Phone, User } from "lucide-react";

import { cn } from "@/components/ui/cn";

/**
 * The top of a repair: what it is, where it stands, who it is for, and the one
 * thing to do next.
 *
 *   ← Repairs
 *   #1008 Lenovo ThinkPad T14 Gen 3  [● New]
 *   ThinkPad T14 - pop-ups and browser redirects
 *   Owen Fitzgerald  780-555-0142           [ Notify: ready... ] [ More ]
 *   Low · Software / Virus · opened Sep 30, 2026
 *   ─────────────────────────────────────────────────────────────────────────
 *   Device   Assigned   Due   Location   Last touched   Total
 *
 * It replaces the generic detail header on this one screen. The title is big,
 * the status is a word with a dot, the customer is a tap away, and there is one
 * black button; every other action sits behind "More". The facts below keep
 * plain labels (no capitals, no tiny type), and nothing here has a coloured
 * side stripe.
 */
export type HeaderFact = { label: string; value: React.ReactNode };

export function RepairHeader({
  back,
  number,
  title,
  status,
  subject,
  customer,
  details,
  primary,
  more,
  facts,
}: {
  back: { label: string; href: string };
  number: number;
  /** The device ("Lenovo ThinkPad T14 Gen 3"), or the subject when no device is on file. */
  title: string;
  /** The live status badge, so a status move lands the instant it is pressed. */
  status: React.ReactNode;
  /** What is wrong, when the title is the device. Left out when it would repeat the title. */
  subject?: string | null;
  customer: { id: string; name: string; phone?: string | null };
  /** The quiet line under the customer: priority, problem type, opened date, the copyable number. */
  details?: React.ReactNode;
  /** The one big black button (or nothing when there is nothing left to do). */
  primary?: React.ReactNode;
  /** The `MoreActions` button with the rest of the actions in it. */
  more?: React.ReactNode;
  facts: HeaderFact[];
}) {
  const phone = customer.phone?.trim() || null;
  const dial = phone ? phone.replace(/[^\d+]/g, "") : null;

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={back.href}
        data-touch-control
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        {back.label}
      </Link>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-col gap-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 text-balance break-words text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
              <span className="rf-num">#{number}</span> {title}
            </h1>
            {status}
          </div>
          {subject ? <p className="text-base leading-snug text-muted-foreground">{subject}</p> : null}

          {/* Who it is for on the left, what to do next on the right. */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-5">
              <Link
                href={`/customers/${customer.id}`}
                data-touch-control
                className="inline-flex min-h-12 items-center gap-2 rounded-lg text-lg font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <User aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 break-words">{customer.name}</span>
              </Link>
              {phone && dial ? (
                <a
                  href={`tel:${dial}`}
                  data-touch-control
                  className="inline-flex min-h-12 items-center gap-2 rounded-lg text-lg font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Phone aria-hidden className="size-5 shrink-0" />
                  <span className="rf-num">{phone}</span>
                </a>
              ) : null}
            </div>

            {primary || more ? (
              // On a phone each takes a full row (the big button's words need the width);
              // from `sm` they sit side by side at the right.
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {primary ? <div className="[&>*]:w-full sm:[&>*]:w-auto">{primary}</div> : null}
                {more ? <div className="[&>*]:w-full sm:[&>*]:w-auto">{more}</div> : null}
              </div>
            ) : null}
          </div>

          {details ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">{details}</div>
          ) : null}
        </div>

        {facts.length > 0 ? (
          <div className="flex flex-wrap overflow-hidden rounded-b-2xl border-t border-border">
            {facts.map((fact) => (
              <div
                key={fact.label}
                // basis sets the wrap threshold; min-w-0 is what lets the value truncate
                className={cn("flex min-w-0 flex-1 basis-[150px] flex-col gap-1 border-l border-border px-4 py-3 first:border-l-0")}
              >
                <p className="truncate text-sm text-muted-foreground">{fact.label}</p>
                <div className="min-w-0 break-words text-base text-foreground">
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
