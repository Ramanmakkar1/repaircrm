import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RecordGrid } from "@/components/ui/record-card";
import { RepairCard } from "@/components/tickets/repair-card";
import { myQueueSentence } from "@/lib/dashboard/logic";
import type { MyQueue } from "@/lib/dashboard/overview";
import { SectionTitle } from "./panel";

/**
 * A technician's own queue, standing in for the Today section (which is money,
 * and technicians do not see money). The same repair cards as the Repairs list.
 */
export function MyQueueSection({ queue, now }: { queue: MyQueue; now: number }) {
  const sentence = myQueueSentence(queue.open, queue.late);
  return (
    <section aria-labelledby="mine-title">
      <SectionTitle id="mine-title" title="My repairs" hint={sentence} href={queue.href} linkLabel="All my repairs" />
      {queue.repairs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-8 text-center sm:flex-row sm:text-left">
          <span className="relative block size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-white">
            <Image src="/images/products/repair-tools.webp" alt="" fill sizes="96px" className="object-contain p-2" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xl font-semibold">Nothing is waiting on you</p>
            <p className="text-base text-muted-foreground">Repairs given to you will show up here, soonest due first.</p>
          </div>
          <Button asChild size="lg" className="h-12 min-w-40 text-base">
            <Link href="/tickets">
              <Plus aria-hidden />
              Find a repair
            </Link>
          </Button>
        </div>
      ) : (
        <RecordGrid className="2xl:grid-cols-2">
          {queue.repairs.map((repair) => (
            <li key={repair.id}>
              <RepairCard
                now={now}
                className="h-full"
                repair={{
                  id: repair.id,
                  number: repair.number,
                  subject: repair.subject,
                  status: repair.status,
                  priority: repair.priority,
                  dueDate: repair.dueAt == null ? null : new Date(repair.dueAt),
                  customer: repair.customer,
                  assignedTo: repair.assignedToName ? { name: repair.assignedToName } : null,
                  asset: repair.asset,
                  attachments: repair.attachments,
                  partOrders: repair.partOrders,
                  checklist: repair.checklist,
                  depositCents: repair.depositCents,
                  needsReply: repair.needsReply,
                }}
              />
            </li>
          ))}
        </RecordGrid>
      )}
    </section>
  );
}
