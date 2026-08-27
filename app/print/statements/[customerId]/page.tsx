import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { resolvePeriod } from "@/components/statements/period";
import { loadStatement } from "@/components/statements/query";
import { StatementSheet } from "@/components/statements/statement-sheet";

/**
 * Printable customer statement.
 *
 * Sits under app/print/layout.tsx, which runs `requireUser()` and supplies the
 * @page / @media print rules — so this route is staff-gated exactly like the
 * invoice and estimate print sheets, with no guard of its own to forget.
 */
export const metadata = { title: "Statement · RepairFlow" };

export default async function StatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [{ customerId }, query] = await Promise.all([params, searchParams]);

  const period = resolvePeriod(query.from, query.to);
  const statement = await loadStatement(shopId, customerId, period);
  if (!statement) notFound();

  return (
    <StatementSheet
      statement={statement}
      from={period.from}
      to={period.to}
      backHref={`/customers/${customerId}/statement?from=${period.fromValue}&to=${period.toValue}`}
    />
  );
}
