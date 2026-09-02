"use client";

import * as React from "react";
import Link from "next/link";
import { Globe, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

import { setVendorActiveAction } from "@/app/(app)/inventory/vendors/actions";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { VendorDialog, type VendorFormValues } from "./vendor-dialog";

export type VendorCardData = VendorFormValues & {
  productCount: number;
  openPoCount: number;
};

/**
 * One vendor in the book: who they are, how to reach them, and the two numbers
 * a buyer actually asks about — how much of the catalogue they supply and how
 * many orders are still outstanding with them.
 *
 * Inactive vendors stay listed but visibly dimmed; they are never deleted
 * because their purchase orders are the shop's buying history.
 */
export function VendorCard({ vendor }: { vendor: VendorCardData }) {
  const [pending, startTransition] = React.useTransition();

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setVendorActiveAction(vendor.id, !vendor.active);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          vendor.active
            ? `${vendor.name} deactivated.`
            : `${vendor.name} reactivated.`,
        );
    });
  };

  return (
    <Card
      interactive
      tone={vendor.active ? undefined : "neutral"}
      className={cn("flex flex-col gap-4 p-5", !vendor.active && "opacity-70")}
    >
      <div className="flex items-start gap-3.5">
        <IconChip icon={ICONS.vendor} />
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/inventory/vendors/${vendor.id}`}
            className="truncate rounded-xs text-[15px] font-bold leading-tight text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            title={vendor.name}
          >
            {vendor.name}
          </Link>
          <span
            className={cn(
              "truncate text-[13px] text-muted-foreground",
              vendor.accountNumber && "font-mono",
            )}
          >
            {vendor.accountNumber
              ? `Account ${vendor.accountNumber}`
              : vendor.address?.split("\n")[0] || "No account number on file"}
          </span>
        </div>
        {!vendor.active ? (
          <StatusPill
            tone="neutral"
            label="Inactive"
            size="sm"
            className="ml-auto shrink-0"
          />
        ) : null}
      </div>

      {/* Omitted entirely when there is nothing to show — an empty flex row
          still takes up its gap and leaves the card looking broken. */}
      {vendor.email || vendor.phone || vendor.website ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {vendor.email ? <Chip icon={ICONS.email}>{vendor.email}</Chip> : null}
          {vendor.phone ? <Chip icon={Phone}>{vendor.phone}</Chip> : null}
          {vendor.website ? <Chip icon={Globe}>{vendor.website}</Chip> : null}
        </div>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4">
        <Stat
          icon={ICONS.inventory}
          value={vendor.productCount}
          label={vendor.productCount === 1 ? "product" : "products"}
        />
        <Stat
          icon={ICONS.purchaseOrder}
          value={vendor.openPoCount}
          label={vendor.openPoCount === 1 ? "open PO" : "open POs"}
          highlight={vendor.openPoCount > 0}
        />
      </div>

      <div className="flex items-center gap-2">
        <VendorDialog
          vendor={vendor}
          trigger={
            <Button variant="outline" size="sm" className="flex-1">
              <ACTIONS.edit className="size-4" />
              Edit
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={toggleActive}
          className={cn(
            "flex-1",
            vendor.active
              ? "text-faint-foreground hover:text-destructive"
              : "text-accent-soft-foreground",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : vendor.active ? (
            <ACTIONS.archive className="size-4" />
          ) : (
            <ACTIONS.retry className="size-4" />
          )}
          {vendor.active ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        className={cn(
          "size-4 shrink-0",
          highlight ? "text-status-in-progress-fg" : "text-faint-foreground",
        )}
      />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn(
            "text-[17px] font-bold tabular-nums leading-none",
            highlight ? "text-status-in-progress-fg" : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
