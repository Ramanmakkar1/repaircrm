"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { chooseXeroTenantAction } from "@/app/(app)/settings/integration-actions";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";

const ConnectIcon = ACTIONS.connect;

/**
 * "Which organisation?" — the one question a Xero grant can leave open.
 *
 * A bookkeeper's Xero login often reaches several organisations, and the token
 * alone does not say which one this shop's books belong in. Guessing would
 * mean writing a repair invoice into a different client's ledger, so the
 * connection sits as `pending` — writing nothing — until this is answered.
 */
export function XeroTenantPicker({
  tenants,
}: {
  tenants: { tenantId: string; tenantName: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function choose(tenantId: string) {
    setBusy(tenantId);
    const result = await chooseXeroTenantAction(tenantId);
    if (!result.ok) {
      setBusy(null);
      toast.error(result.error);
      return;
    }
    toast.success("Xero is connected.");
    router.push("/settings?tab=integrations&connected=xero");
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tenants.map((tenant) => (
          <li
            key={tenant.tenantId}
            className="flex min-h-28 flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-4"
          >
            <span className="flex min-w-0 items-center gap-3.5">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-foreground"
              >
                <Building2 className="size-7" strokeWidth={1.6} />
              </span>
              <span className="min-w-0 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">
                {tenant.tenantName}
              </span>
            </span>
            <Button
              className="h-12 w-full text-base"
              disabled={busy !== null}
              onClick={() => choose(tenant.tenantId)}
              aria-label={`Use ${tenant.tenantName}`}
            >
              {busy === tenant.tenantId ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ConnectIcon aria-hidden />
              )}
              {busy === tenant.tenantId ? "Connecting…" : "Use this one"}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[15px] text-muted-foreground">
        Not sure? Pick the one your accountant uses for this shop. You can change it later by connecting Xero again.
      </p>
    </div>
  );
}
