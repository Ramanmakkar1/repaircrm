import { format } from "date-fns";
import { Lock, Send } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ICONS } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { relativeShort } from "./ticket-meta";

/**
 * Local copy of the avatar initials logic.
 *
 * `getInitials` is exported from components/ui/avatar.tsx, which is a
 * "use client" module — a server component may render its components but may
 * not call its functions, so importing it here fails at request time (not at
 * build time, which is what makes it worth calling out).
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type TimelineEntry = {
  id: string;
  body: string;
  isPublic: boolean;
  subject: string | null;
  /** Set to the new status when this comment accompanied a status change. */
  updateType: string | null;
  channel: string;
  createdAt: Date;
  authorName: string | null;
};

/**
 * Newest-first history of everything said about this ticket.
 *
 * Private notes carry an amber tint and public ones stay on the card surface —
 * the single most important distinction on the page, since one of them is
 * visible to the customer and the other is where techs are blunt.
 */
export function Timeline({
  entries,
  now,
  statuses,
}: {
  entries: TimelineEntry[];
  now: number;
  /** The shop's workflow states, used to tell a status move from a lifecycle event. */
  statuses: string[];
}) {
  return (
    <Card>
      <CardHeader icon={ICONS.audit} title="Timeline" />
      <CardContent className="flex flex-col gap-2.5">
        {entries.length === 0 ? (
          <EmptyState
            className="px-2 py-10"
            icon={ICONS.message}
            title="Nothing logged yet"
            hint="Every status change, note and message to the customer lands here, newest first."
          />
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className={cn(
                "rounded-lg border px-3 py-2.5",
                entry.isPublic
                  ? "border-border bg-surface"
                  : "border-status-in-progress-bg bg-status-in-progress-bg/60",
              )}
            >
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Avatar className="size-5">
                  <AvatarFallback className="text-[9px]">
                    {initials(entry.authorName ?? "System")}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground">
                  {entry.authorName ?? "System"}
                </span>

                {/* `updateType` carries either a status the ticket moved to, or
                    a lifecycle event ("Created", "Invoiced"). Only the former
                    reads as a status change. */}
                {entry.updateType ? (
                  <Badge variant="default">
                    {statuses.includes(entry.updateType)
                      ? `Status → ${entry.updateType}`
                      : entry.updateType}
                  </Badge>
                ) : null}

                <span className="ml-auto flex items-center gap-2 text-xs text-faint-foreground">
                  {entry.isPublic ? (
                    <span className="flex items-center gap-1 text-accent-soft-foreground">
                      <Send className="size-3.5" />
                      Sent to customer
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3.5" />
                      Private
                    </span>
                  )}
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    title={format(entry.createdAt, "EEEE d MMMM yyyy, h:mm a")}
                  >
                    {relativeShort(entry.createdAt, now)}
                  </time>
                </span>
              </header>

              {entry.subject ? (
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  {entry.subject}
                </p>
              ) : null}

              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {entry.body}
              </p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}
