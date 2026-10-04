import * as React from "react";

import { StatusPill } from "@/components/ui/badge";
import { InitialsVisual, MetaChip, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { LEAD_STATUS_META, asLeadStatus, messagePreview } from "@/components/leads/lead-meta";
import { CallButton, CallButtonSpace } from "./call-button";
import { leadFacts } from "./lead-facts";

export type LeadCardRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  message: string | null;
  status: string;
  createdAt: Date;
  customerId: string | null;
  ticketId: string | null;
};

/**
 * The Easy mode enquiries list: one big card per enquiry, built like the
 * customer cards. Name, the status in words (New, Contacted, Converted,
 * Closed), the phone (or email) with a line of what they asked, and up to
 * three facts. The phone's tap-to-call button is a sibling of the card link,
 * never inside it.
 */
export function LeadCards({ rows, now }: { rows: LeadCardRow[]; now?: Date }) {
  return (
    <RecordGrid>
      {rows.map((lead) => {
        const meta = LEAD_STATUS_META[asLeadStatus(lead.status)];
        const reach = lead.phone?.trim() || lead.email?.trim() || null;
        const ask = lead.message ? messagePreview(lead.message, 90) : null;
        const phone = lead.phone?.trim() || null;
        const pill = <StatusPill tone={meta.tone} label={meta.label} />;

        return (
          <li key={lead.id} className="relative">
            <RecordCard
              // h-full: fill the grid-stretched <li>, so a row of cards is one height
              // and the call button (centred on the <li>) is centred on its card.
              className="h-full"
              href={`/leads/${lead.id}`}
              visual={<InitialsVisual name={lead.name} />}
              title={lead.name}
              // Beside the name on a tablet; on a phone it moves down to the facts,
              // because next to the name it left room for only "Ibrahi…".
              status={<span className="hidden sm:block">{pill}</span>}
              subtitle={
                reach || ask ? (
                  // At most two lines, so the card's own two-line clamp never cuts anything.
                  <span className="block">
                    {reach ? <span className="block truncate">{reach}</span> : null}
                    {ask ? <span className="block truncate text-foreground">{ask}</span> : null}
                  </span>
                ) : undefined
              }
              meta={
                <>
                  <span className="sm:hidden">{pill}</span>
                  {leadFacts({ ...lead, now }).map((fact) => (
                    <MetaChip key={fact}>{fact}</MetaChip>
                  ))}
                </>
              }
              trailing={phone ? <CallButtonSpace /> : undefined}
            />
            {phone ? <CallButton phone={phone} who={lead.name} /> : null}
          </li>
        );
      })}
    </RecordGrid>
  );
}
