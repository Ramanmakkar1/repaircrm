import { redirect } from "next/navigation";

import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readSettings } from "@/lib/integrations/oauth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { XeroTenantPicker } from "@/components/settings/xero-tenant-picker";

export const metadata = { title: "Choose a Xero organisation · RepairPilot" };
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
    <div className="flex flex-col gap-6">
      {/*
        A back link rather than a breadcrumb trail: breadcrumbs mean "this
        screen is a record and here is where it sits". This screen is a step
        you entered from the Integrations panel and leave the moment you pick.
      */}
      <Link
        href="/settings?tab=integrations"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All integrations
      </Link>

      <PageHeader
        title="Choose a Xero organisation"
        description="Your Xero login reaches more than one set of books. Pick the one this shop belongs in."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Organisations this login can reach</CardTitle>
        </CardHeader>
        <CardContent>
          <XeroTenantPicker tenants={tenants} />
        </CardContent>
      </Card>
    </div>
  );
}
