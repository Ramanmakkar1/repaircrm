import Link from "next/link";

import { ICONS } from "@/components/ui/icons";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { warrantyLabel } from "@/lib/warranty";
import { BigRowLink } from "./activity-cards";
import { formatDate } from "./format";
import { SectionCard } from "./section-card";

export type WarrantyRow = {
  id: string;
  description: string;
  invoiceId: string;
  invoiceNumber: number;
  soldAt: Date;
  expiresAt: Date;
  days: number;
  active: boolean;
};

/**
 * What this customer is still covered for.
 *
 * Every warranted line they have ever been sold, live ones first — the
 * question at the counter is "is this still under warranty?", and the answer
 * has to be visible without opening three invoices. Expired rows stay: knowing
 * cover ran out last month is the other half of the same answer.
 */
export function WarrantiesCard({
  warranties,
  easy = false,
  timeZone,
}: {
  warranties: WarrantyRow[];
  /**
   * Easy mode: each warranty is one big row (48px and up) that opens the invoice
   * it was sold on, with "Active" or "Expired" in words, instead of a table whose
   * only link was the 20px "#1012".
   */
  easy?: boolean;
  /** The shop's time zone (Shop.timezone): sold and expiry dates are the shop's calendar days. */
  timeZone?: string | null;
}) {
  const active = warranties.filter((row) => row.active).length;
  // Live cover first; within each group the newest purchase leads, which is
  // the order the query already returned them in.
  const rows = [...warranties].sort(
    (a, b) => Number(b.active) - Number(a.active),
  );

  return (
    <SectionCard
      icon={ICONS.warranty}
      title="Warranties"
      count={active}
      empty="Nothing sold to this customer carries a warranty."
    >
      {warranties.length > 0 && easy ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <BigRowLink
                href={`/invoices/${row.invoiceId}`}
                title={row.description}
                detail={
                  <>
                    {`${warrantyLabel(row.days)} cover · Invoice #${row.invoiceNumber} · Sold ${formatDate(row.soldAt, timeZone)}`}
                    {/* On a phone the status goes under the words, so the item's name keeps the width. */}
                    <span className="mt-1.5 block sm:hidden">
                      <WarrantyPill row={row} timeZone={timeZone} />
                    </span>
                  </>
                }
                trailing={
                  <span className="shrink-0 max-sm:hidden">
                    <WarrantyPill row={row} timeZone={timeZone} />
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      ) : warranties.length > 0 ? (
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th className="w-20">Invoice</Th>
              <Th className="hidden sm:table-cell">Sold</Th>
              <Th className="text-right">Expires</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <Td className="max-w-[18rem]">
                  <span className="block truncate font-semibold text-foreground">
                    {row.description}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {warrantyLabel(row.days)} cover
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/invoices/${row.invoiceId}`}
                    className="font-semibold tabular-nums text-accent hover:underline"
                  >
                    #{row.invoiceNumber}
                  </Link>
                </Td>
                <Td className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(row.soldAt, timeZone)}
                </Td>
                <Td className="text-right">
                  <WarrantyPill row={row} timeZone={timeZone} />
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      ) : undefined}
    </SectionCard>
  );
}

/** "Active · Oct 4, 2027" or "Expired · Sep 1, 2026": the word first, the tint only backs it up. */
function WarrantyPill({ row, timeZone }: { row: WarrantyRow; timeZone?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        row.active ? "bg-status-resolved-bg text-status-resolved-fg" : "bg-surface-hover text-muted-foreground",
      )}
    >
      {row.active ? "Active" : "Expired"} · {formatDate(row.expiresAt, timeZone)}
    </span>
  );
}
