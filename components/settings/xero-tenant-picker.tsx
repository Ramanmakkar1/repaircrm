"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { toast } from "sonner";

import { chooseXeroTenantAction } from "@/app/(app)/settings/integration-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

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
  const [selected, setSelected] = React.useState(tenants[0]?.tenantId ?? "");
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    const result = await chooseXeroTenantAction(selected);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Xero connected.");
    router.push("/settings?tab=integrations&connected=xero");
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2.5">
        {tenants.map((tenant) => {
          const active = tenant.tenantId === selected;
          return (
            <li key={tenant.tenantId}>
              <button
                type="button"
                onClick={() => setSelected(tenant.tenantId)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-md border px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-surface hover:bg-surface-hover",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "bg-surface-hover text-muted-foreground",
                  )}
                >
                  {active ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : (
                    <Building2 className="size-4" strokeWidth={2.25} />
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold text-foreground">
                    {tenant.tenantName}
                  </span>
                  <span className="truncate font-mono text-[12px] text-muted-foreground">
                    {tenant.tenantId}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <Button onClick={confirm} disabled={busy || !selected}>
          {busy ? "Connecting…" : "Use this organisation"}
        </Button>
        <span className="text-[13px] text-muted-foreground">
          You can switch later by reconnecting Xero.
        </span>
      </div>
    </div>
  );
}
