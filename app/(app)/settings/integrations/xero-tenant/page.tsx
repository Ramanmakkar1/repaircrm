import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readSettings } from "@/lib/integrations/oauth";
import { PageHeader } from "@/components/ui/page-header";
import { XeroTenantPicker } from "@/components/settings/xero-tenant-picker";

export const metadata = { title: "Choose your Xero books · Repairs helper" };
export const dynamic = "force-dynamic";

/**
 * The picker a multi-organisation Xero grant lands on.
 *
 * It is a route rather than a dialog because the operator arrives here from
 * Xero's own domain, mid-redirect, with no page of ours left on screen to open
 * a dialog over. Anyone reaching it with nothing pending is sent back to the
 * tab, which is where the answer lives either way.
 */
export default async function XeroTenantPage() {
  const session = await requireUser();
  if (session.role !== "OWNER") redirect("/settings");

  const connection = await db.integrationConnection.findFirst({
    where: { shopId: session.shopId, provider: "xero" },
    select: { status: true, settings: true },
  });

  const tenants = readSettings(connection?.settings).xeroTenants ?? [];
  if (!connection || connection.status !== "pending" || tenants.length === 0) {
    redirect("/settings?tab=integrations");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/*
        One question, nothing else on the screen. The shell's Back leads out;
        leaving without choosing writes nothing (the connection stays pending).
      */}
      <PageHeader
        title="Which Xero books are this shop's?"
        description="Your Xero login opens more than one set of books. Tap the one this shop's invoices and payments should go to."
      />
      <XeroTenantPicker tenants={tenants} />
    </div>
  );
}
