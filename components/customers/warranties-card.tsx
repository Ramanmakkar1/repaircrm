import Link from "next/link";

import { ICONS } from "@/components/ui/icons";
import { TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { warrantyLabel } from "@/lib/warranty";
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
export function WarrantiesCard({ warranties }: { warranties: WarrantyRow[] }) {
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
      {warranties.length > 0 ? (
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
                  {formatDate(row.soldAt)}
                </Td>
                <Td className="text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
                      row.active
                        ? "bg-status-resolved-bg text-status-resolved-fg"
                        : "bg-surface-hover text-muted-foreground",
                    )}
                  >
                    {row.active ? "Active" : "Expired"} · {formatDate(row.expiresAt)}
                  </span>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      ) : undefined}
    </SectionCard>
  );
}
