"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes,
  ClipboardList,
  Globe,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  Store,
} from "lucide-react";
import { toast } from "sonner";

import { setVendorActiveAction } from "@/app/(app)/inventory/vendors/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
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
      else toast.success(vendor.active ? "Vendor deactivated" : "Vendor reactivated");
    });
  };

  return (
    <Card
      className={cn(
        "rf-lift flex flex-col gap-4 p-5 transition-shadow hover:shadow-md",
        !vendor.active && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
          <Store className="size-5" strokeWidth={2.25} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/inventory/vendors/${vendor.id}`}
            className="truncate text-[15px] font-bold leading-tight text-foreground hover:underline"
          >
            {vendor.name}
          </Link>
          <span className="truncate text-[13px] text-muted-foreground">
            {vendor.accountNumber
              ? `Account ${vendor.accountNumber}`
              : vendor.address?.split("\n")[0] || "No account number on file"}
          </span>
        </div>
        {!vendor.active ? (
          <Chip className="ml-auto shrink-0 font-semibold text-faint-foreground">
            Inactive
          </Chip>
        ) : null}
      </div>

      {/* Omitted entirely when there is nothing to show — an empty flex row
          still takes up its gap and leaves the card looking broken. */}
      {vendor.email || vendor.phone || vendor.website ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {vendor.email ? <Chip icon={Mail}>{vendor.email}</Chip> : null}
          {vendor.phone ? <Chip icon={Phone}>{vendor.phone}</Chip> : null}
          {vendor.website ? <Chip icon={Globe}>{vendor.website}</Chip> : null}
        </div>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4">
        <Stat
          icon={Boxes}
          value={vendor.productCount}
          label={vendor.productCount === 1 ? "product" : "products"}
        />
        <Stat
          icon={ClipboardList}
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
              <Pencil className="size-4" />
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
          {vendor.active ? null : <RotateCcw className="size-4" />}
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
