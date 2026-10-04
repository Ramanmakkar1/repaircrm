import * as React from "react";

import { cn } from "@/components/ui/cn";
import { ICONS } from "@/components/ui/icons";
import { IconVisual, InitialsVisual, MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { CallButton, CallButtonSpace } from "./call-button";
import { customerFacts, isPlaceholderName, primaryPhone } from "./customer-facts";

export type CustomerCardRow = {
  id: string;
  /** The person: "Elena Marquez". Falls back to the business name when blank. */
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  openRepairs: number;
  owedCents: number;
  lastVisit: Date | null;
};

/**
 * The Easy mode customer list: one big card per person, the way Home shows
 * boxes. Picture (initials), name, the business when there is one, phone then
 * email, and up to three facts in words, each only when true.
 *
 * The card is one link to the customer. The phone's tap-to-call button is a
 * SIBLING of that link (never inside it: a link in a link is invalid and
 * ambiguous), parked over the space the card reserves on its right edge.
 */
export function CustomerCards({
  rows,
  now,
  timeZone,
}: {
  rows: CustomerCardRow[];
  now?: Date;
  /** The shop's time zone (Shop.timezone): "Last visit Sep 30" is the shop's calendar day. */
  timeZone?: string | null;
}) {
  return (
    <RecordGrid>
      {rows.map((row) => {
        const { value: phone } = primaryPhone(row);
        const facts = customerFacts({
          openRepairs: row.openRepairs,
          owedCents: row.owedCents,
          lastVisit: row.lastVisit,
          now,
          timeZone,
        });
        const title = row.name || row.businessName || "Unnamed customer";
        const business = row.name && row.businessName ? row.businessName : null;
        const email = row.email?.trim() || null;

        return (
          <li key={row.id} className="relative">
            <RecordCard
              // h-full: the grid stretches the <li> to the tallest card in the
              // row; the card must fill it so every card in a row is the same
              // height and the call button (centred on the <li>) is centred on the card.
              className="h-full"
              href={`/customers/${row.id}`}
              visual={isPlaceholderName(title) ? <IconVisual icon={ICONS.customer} /> : <InitialsVisual name={title} />}
              title={title}
              subtitle={
                business || phone || email ? (
                  // At most two lines, so the card's own two-line clamp never
                  // cuts anything: the business (when there is one), then the phone
                  // with the email beside it. The phone never shrinks; a long email
                  // gives way with an ellipsis, and on a phone it is left off (the
                  // card has no room for it; the customer page has it, tap-to-edit).
                  <span className="block">
                    {business ? <span className="block truncate font-medium text-foreground">{business}</span> : null}
                    {phone || email ? (
                      <span className="flex min-w-0 items-baseline gap-3">
                        {phone ? <span className="shrink-0">{phone}</span> : null}
                        {email ? <span className={cn("min-w-0 truncate", phone && "hidden sm:block")}>{email}</span> : null}
                      </span>
                    ) : null}
                  </span>
                ) : undefined
              }
              meta={
                facts.length > 0
                  ? facts.map((fact) => (
                      <MetaChip key={fact.key} tone={fact.tone}>
                        {fact.label}
                      </MetaChip>
                    ))
                  : undefined
              }
              // Reserves the right edge for the call button below.
              trailing={phone ? <CallButtonSpace /> : undefined}
            />
            {phone ? <CallButton phone={phone} who={title} /> : null}
          </li>
        );
      })}
    </RecordGrid>
  );
}
