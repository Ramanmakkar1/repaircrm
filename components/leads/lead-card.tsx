import Link from "next/link";
import { Mail, MessageSquareText, Phone, Tag } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import {
  LEAD_STATUS_META,
  asLeadStatus,
  isFreshLead,
  leadAge,
  leadInitials,
  messagePreview,
} from "./lead-meta";

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
 * One enquiry in the inbox.
 *
 * The card carries its status as the shared left-edge `tone` stripe, so a lead
 * reads the same way a ticket does. A NEW lead under a day old additionally
 * gets the accent bar — the cheapest possible "this is still warm, call them"
 * signal, and it disappears on its own once the lead is answered or goes cold.
 * Everything else on the card is grey so the stripe and the status pill are
 * the only colour.
 */
export function LeadCard({ lead, now }: { lead: LeadCardRow; now: Date }) {
  const status = asLeadStatus(lead.status);
  const meta = LEAD_STATUS_META[status];
  const fresh = isFreshLead({ status: lead.status, createdAt: lead.createdAt }, now);

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        interactive
        tone={meta.tone}
        className={cn(
          "flex h-full flex-col gap-4 p-5",
          fresh && "border-l-4 border-l-accent",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-accent-soft-foreground">
              {leadInitials(lead.name)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate text-[17px] font-bold leading-tight text-foreground"
                title={lead.name}
              >
                {lead.name}
              </span>
              <span className="text-[13px] text-faint-foreground">
                {leadAge(lead.createdAt, now)}
              </span>
            </div>
          </div>

          <StatusPill tone={meta.tone} label={meta.label} className="shrink-0" />
        </div>

        <div className="flex flex-col gap-1.5 text-[13.5px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-faint-foreground" />
            <span className="truncate">{lead.phone ?? "No phone given"}</span>
          </span>
          <span className="flex items-center gap-2">
            <Mail className="size-4 shrink-0 text-faint-foreground" />
            <span className="truncate">{lead.email ?? "No email given"}</span>
          </span>
        </div>

        {lead.message ? (
          <p className="flex gap-2 text-[13.5px] leading-snug text-muted-foreground">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
            <span className="line-clamp-2">{messagePreview(lead.message)}</span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Chip icon={Tag}>{lead.source ?? "No source"}</Chip>
          {lead.customerId ? (
            <Chip className="bg-chip-accent-bg font-semibold text-chip-accent-fg">
              Customer linked
            </Chip>
          ) : null}
          {lead.ticketId ? (
            <Chip className="bg-chip-accent-bg font-semibold text-chip-accent-fg">
              Ticket opened
            </Chip>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
