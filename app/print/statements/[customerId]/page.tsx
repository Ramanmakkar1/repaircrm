import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatementSheet } from "@/components/billing/print-statement-sheet";
import { resolvePeriod } from "@/components/statements/period";
import { loadStatement } from "@/components/statements/query";

/**
 * Printable customer statement.
 *
 * Sits under app/print/layout.tsx, which runs `requireUser()` and supplies the
 * shared print stylesheet — so this route is staff-gated exactly like the
 * invoice and estimate print sheets, with no guard of its own to forget.
 *
 * `loadStatement` already returns the shop block, but not its logo (an emailed
 * statement has no use for one), so the mark is fetched alongside it.
 */
export const metadata = { title: "Statement · RepairPilot" };

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
  const [statement, shop] = await Promise.all([
    loadStatement(shopId, customerId, period),
    db.shop.findUnique({ where: { id: shopId }, select: { logoUrl: true } }),
  ]);
  if (!statement) notFound();

  return (
    <StatementSheet
      statement={statement}
      from={period.from}
      to={period.to}
      logoUrl={shop?.logoUrl}
      backHref={`/customers/${customerId}/statement?from=${period.fromValue}&to=${period.toValue}`}
    />
  );
}
