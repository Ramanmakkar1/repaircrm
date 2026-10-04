import * as React from "react";
import { Phone } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { telHref } from "./customer-facts";

export type HeroFact = {
  label: string;
  value: React.ReactNode;
  /** `alert` is red money owed; `good` is credit on file. The words still carry the meaning. */
  tone?: "alert" | "good";
  /** A small control that belongs to this fact (for example "Add Credit"). */
  action?: React.ReactNode;
};

/**
 * The top of a person's page in Easy mode: a big name, their phone as a large
 * tap-to-call link, ONE big black action out front (`primary`) and everything
 * else behind it (`menu`), then a few facts as plain label/value pairs.
 *
 * One panel, no cards inside it, no coloured edge: the whole header is a single
 * surface, like the Home boxes. The shell already provides Back and Home above
 * it, so there is no breadcrumb here.
 */
export function DetailHero({
  visual,
  title,
  subtitle,
  status,
  phone,
  contact,
  primary,
  menu,
  facts = [],
  className,
}: {
  /** InitialsVisual or IconVisual. */
  visual?: React.ReactNode;
  title: string;
  /** The business name, when there is one. */
  subtitle?: string | null;
  /** A StatusPill. Always carries its word. */
  status?: React.ReactNode;
  /** Shown big, and dialled on tap. Nothing renders without one. */
  phone?: string | null;
  /** Anything else worth one tap under the phone (an email link). */
  contact?: React.ReactNode;
  /** The single black button. */
  primary?: React.ReactNode;
  /** A "More" menu, beside the primary action. */
  menu?: React.ReactNode;
  facts?: HeroFact[];
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {visual ? <span className="shrink-0">{visual}</span> : null}
          <div className="flex min-w-0 flex-col items-start gap-2">
            <h1 className="min-w-0 text-balance break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
            {subtitle ? <p className="text-base text-muted-foreground">{subtitle}</p> : null}
            {status}
            {phone ? (
              <a
                href={telHref(phone)}
                data-touch-control
                aria-label={`Call ${phone}`}
                className="rf-num mt-1 inline-flex min-h-14 max-w-full items-center gap-3 rounded-xl bg-accent-soft px-5 text-xl font-semibold text-accent-soft-foreground transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Phone className="size-6 shrink-0" aria-hidden />
                <span className="truncate">{phone}</span>
              </a>
            ) : null}
            {contact}
          </div>
        </div>

        {primary || menu ? <div className="flex shrink-0 items-center gap-3 [&>*:first-child]:flex-1 md:[&>*:first-child]:flex-none">{primary}{menu}</div> : null}
      </div>

      {facts.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-5">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd
                className={cn(
                  "rf-num min-w-0 text-lg font-semibold leading-snug",
                  fact.tone === "alert" && "text-status-overdue-fg",
                  fact.tone === "good" && "text-status-resolved-fg",
                )}
              >
                {fact.value}
              </dd>
              {fact.action ? <div className="pt-1">{fact.action}</div> : null}
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
