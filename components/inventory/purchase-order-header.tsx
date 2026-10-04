import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";

import { IconVisual } from "@/components/ui/record-card";

export type PurchaseOrderFact = { label: string; value: React.ReactNode };

/**
 * The top of a purchase order in Easy mode: a big title, its status in words,
 * what it costs, and the single next step as one big black button, with the
 * other buttons beside it. The facts (supplier, delivery date, account...) sit
 * below as plain label / value pairs, not as a strip of tiny columns.
 *
 * It replaces the dense object header on this screen only; every fact that
 * header carried is still here.
 */
export function PurchaseOrderHeader({
  back,
  title,
  status,
  id,
  subtitle,
  total,
  facts,
  actions,
}: {
  back: { label: string; href: string };
  title: string;
  /** A StatusPill. */
  status: React.ReactNode;
  /** A CopyableId, or anything else that identifies the order. */
  id?: React.ReactNode;
  subtitle?: string;
  /** The formatted order total. */
  total: string;
  facts: PurchaseOrderFact[];
  /** The buttons. The next step comes first and is the only black one. */
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={back.href}
        data-touch-control
        className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl pr-3 text-base font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden className="size-5 shrink-0" />
        {back.label}
      </Link>

      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-4">
            <IconVisual icon={Package} className="hidden sm:flex" />
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-balance text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
              {status}
              {subtitle || id ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {subtitle ? <p className="text-base text-muted-foreground">{subtitle}</p> : null}
                  {id}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col sm:items-end">
            <span className="rf-num text-[28px] font-semibold leading-tight tabular-nums">{total}</span>
            <span className="text-sm text-muted-foreground">order total</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">{actions}</div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-5 sm:grid-cols-3 xl:grid-cols-6">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 break-words text-base font-medium text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
