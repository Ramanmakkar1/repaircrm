import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";

import { recountStorageAction } from "@/app/platform/shops/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { formatDateTime, timeAgo } from "@/lib/platform-format";
import { SHOP_STATUS_LABELS, type ShopStatus } from "@/lib/platform-directory";

/** The page title block every console screen starts with. */
export function PageTitle({ title, intro, children }: { title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {intro ? <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-muted-foreground">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** One big number in a box. With `href` the whole box is a link. */
export function StatTile({
  label,
  value,
  detail,
  href,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  href?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon aria-hidden="true" className="size-5 shrink-0 text-faint-foreground" /> : null}
      </div>
      <p className="mt-2 break-words text-[30px] font-semibold leading-tight tracking-tight tabular-nums">{value}</p>
      {detail ? <div className="mt-1.5 text-sm leading-5 text-muted-foreground">{detail}</div> : null}
      {href ? (
        <ChevronRight aria-hidden="true" className="absolute bottom-4 right-4 size-5 text-faint-foreground transition-transform group-hover:translate-x-0.5" />
      ) : null}
    </>
  );
  const frame = "relative block h-full rounded-lg border border-border bg-surface p-4 sm:p-5";
  return href ? (
    <Link
      href={href}
      className={cn(
        frame,
        "group pr-10 hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}

/** A titled box for a group of related things. */
export function Panel({
  title,
  detail,
  action,
  children,
  className,
  id,
}: {
  title: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={cn("rounded-lg border border-border bg-surface", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {detail ? <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

const STATUS_STYLES: Record<ShopStatus, { pill: string; dot: string }> = {
  active: { pill: "bg-status-resolved-bg text-status-resolved-fg", dot: "bg-status-resolved" },
  quiet: { pill: "bg-surface-hover text-muted-foreground", dot: "bg-faint-foreground" },
  closing: { pill: "bg-status-overdue-bg text-status-overdue-fg", dot: "bg-status-overdue" },
};

/** Status always shows its word, never colour alone. */
export function StatusPill({ status }: { status: ShopStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", style.pill)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {SHOP_STATUS_LABELS[status]}
    </span>
  );
}

export function NewPill() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-status-new-bg px-2.5 py-0.5 text-[13px] font-semibold text-status-new-fg">
      New
    </span>
  );
}

/** A relative time ("3 hours ago") with the exact UTC time a hover or long-press away. */
export function TimeAgo({ value, now, className }: { value: Date | null; now: Date; className?: string }) {
  if (!value) return <span className={className}>Never</span>;
  return (
    <time dateTime={value.toISOString()} title={formatDateTime(value)} className={className}>
      {timeAgo(value, now)}
    </time>
  );
}

/** A thin horizontal bar for a share of a total. Decorative: the number beside it carries the meaning. */
export function ShareBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("h-2 overflow-hidden rounded-full bg-surface-hover", className)}>
      <div className="h-full rounded-full bg-foreground/80" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** "Count again" for the storage numbers, with when they were last counted. */
export function RecountStorage({ countedAt, now }: { countedAt: Date; now: Date }) {
  return (
    <form action={recountStorageAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm text-muted-foreground">
        Space counted <TimeAgo value={countedAt} now={now} />
      </span>
      <SubmitButton variant="outline" size="sm" pendingLabel="Counting…">
        <RefreshCw aria-hidden="true" />
        Count again
      </SubmitButton>
    </form>
  );
}
