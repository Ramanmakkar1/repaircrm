import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetaChip } from "@/components/ui/record-card";
import type { NeedsYouRow } from "@/lib/dashboard/logic";
import { SectionTitle } from "./panel";
import { RowVisual } from "./thumbs";

/**
 * "Needs you now": the few things most worth doing right now, ranked, each one
 * a picture, one plain sentence and ONE big button. When there is nothing, a
 * calm "all caught up" with the next sensible action. `candidates` is every
 * different thing that needs you (a repair counts once), so "N more can wait"
 * is the true number left off the list.
 */
export function NeedsYouSection({ rows, candidates }: { rows: readonly NeedsYouRow[]; candidates: number }) {
  const hidden = Math.max(0, candidates - rows.length);
  return (
    <section aria-labelledby="needs-title">
      <SectionTitle
        id="needs-title"
        title="Needs you now"
        hint={rows.length === 0 ? undefined : hidden > 0 ? `The ${rows.length} that matter most. ${hidden} more can wait.` : "In the order to do them."}
      />
      {rows.length === 0 ? <AllCaughtUp /> : <NeedsYouList rows={rows} />}
    </section>
  );
}

export function NeedsYouList({ rows }: { rows: readonly NeedsYouRow[] }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
          <RowVisual visual={row.visual} />
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <MetaChip>{row.tag}</MetaChip>
            <p className="text-base font-medium leading-snug">{row.sentence}</p>
          </div>
          <Button asChild size="lg" className="col-span-2 h-12 min-w-32 text-base sm:col-span-1">
            {row.action.call ? <a href={row.action.href}>{row.action.label}</a> : <Link href={row.action.href}>{row.action.label}</Link>}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function AllCaughtUp() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-8 text-center sm:flex-row sm:text-left">
      <span className="relative block size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-white">
        <Image src="/images/home/pickup-bag.webp" alt="" fill sizes="96px" className="object-contain p-2" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xl font-semibold">You are all caught up</p>
        <p className="text-base text-muted-foreground">Nothing is late, waiting for a reply, unpaid or running out. A good moment to check in the next device.</p>
      </div>
      <Button asChild size="lg" className="h-12 min-w-40 text-base">
        <Link href="/tickets/new">
          <Plus aria-hidden />
          New repair
        </Link>
      </Button>
    </div>
  );
}
