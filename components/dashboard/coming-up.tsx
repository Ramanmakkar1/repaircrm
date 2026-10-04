import Image from "next/image";
import Link from "next/link";
import { CircleCheck, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { MetaChip } from "@/components/ui/record-card";
import { orderMoreHref, stockLeftWords } from "@/lib/dashboard/logic";
import type { ShopOverview } from "@/lib/dashboard/overview";
import { Panel } from "./panel";
import { ProductThumb } from "./thumbs";

const CARD_TITLE = "text-lg font-semibold";

/** "Coming up": the next visits booked, each one a big tap that opens that day. */
export function AppointmentsCard({ appointments, className }: { appointments: ShopOverview["appointments"]; className?: string }) {
  return (
    <Panel aria-labelledby="visits-title" className={className}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="visits-title" className={CARD_TITLE}>
          Coming up
        </h2>
        <Link href="/appointments" data-touch-control className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-soft-foreground hover:underline">
          All visits →
        </Link>
      </div>
      {appointments.length === 0 ? (
        <div className="mt-2 flex items-center gap-4 rounded-xl bg-surface-hover p-3">
          <span className="relative block size-16 shrink-0 overflow-hidden rounded-xl bg-white">
            <Image src="/images/home/diary.webp" alt="" fill sizes="64px" className="object-contain p-1" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <p className="text-[15px] font-medium text-muted-foreground">No visits booked.</p>
            <Button asChild variant="outline" className="h-12 text-[15px]">
              <Link href="/appointments">
                <Plus aria-hidden />
                Book a visit
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <Link
                href={appointment.href}
                data-touch-control
                className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-1.5 hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex w-20 shrink-0 flex-col leading-tight">
                  <span className="rf-num text-[15px] font-semibold">{appointment.time}</span>
                  <span className="text-sm text-muted-foreground">{appointment.day}</span>
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[15px] font-semibold">{appointment.customerName ?? appointment.title}</span>
                  {appointment.customerName ? <span className="truncate text-sm text-muted-foreground">{appointment.title}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** "Stock watch": the products at or below their reorder point, with the one button that orders more. */
export function StockWatchCard({ stock, canOrder, className }: { stock: ShopOverview["stockWatch"]; canOrder: boolean; className?: string }) {
  const hidden = Math.max(0, stock.total - stock.items.length);
  return (
    <Panel aria-labelledby="stock-title" className={className}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="stock-title" className={CARD_TITLE}>
          Stock watch
        </h2>
        <Link href="/inventory?filter=low" data-touch-control className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-soft-foreground hover:underline">
          {stock.total > 0 ? `All ${stock.total} low` : "Stock"} →
        </Link>
      </div>
      {stock.items.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-surface-hover px-3 py-4 text-[15px] font-medium text-muted-foreground">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          Nothing is running low.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {stock.items.map((item) => {
            const out = item.stockQty <= 0;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <ProductThumb name={item.name} category={item.category} catalogImage={item.catalogImage} imageUrl={item.imageUrl} className="size-14" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1 leading-tight">
                  <span className="line-clamp-2 text-[15px] font-semibold">{item.name}</span>
                  <MetaChip tone={out ? "alert" : "neutral"}>
                    {stockLeftWords(item.stockQty)}
                    {item.lowStockAt != null && !out ? ` · reorder at ${item.lowStockAt}` : ""}
                  </MetaChip>
                </div>
                <Button asChild variant={canOrder ? "default" : "outline"} className={cn("h-12 min-w-24 shrink-0 text-[15px]")}>
                  <Link href={orderMoreHref({ canOrder, productId: item.id, vendorId: item.vendorId })}>{canOrder ? "Reorder" : "Open"}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 ? <p className="mt-2 text-sm text-muted-foreground">{hidden} more at or below their reorder point.</p> : null}
    </Panel>
  );
}
