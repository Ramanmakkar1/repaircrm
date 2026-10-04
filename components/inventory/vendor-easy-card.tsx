import { ClipboardList, Package, Truck } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { IconVisual, MetaChip } from "@/components/ui/record-card";
import { vendorContactLines } from "./easy-lists";
import { RecordWithActions } from "./record-with-actions";
import { VendorActions } from "./vendor-actions";
import type { VendorCardData } from "./vendor-card";

/**
 * One supplier in the Easy-mode list: a truck, the name, how to reach them, and
 * the two numbers a buyer asks about (what they supply, what is still on order).
 * The card opens the supplier; Edit and Deactivate sit in the strip under it,
 * because retiring a supplier is only possible from the list.
 */
export function VendorEasyCard({ vendor }: { vendor: VendorCardData }) {
  return (
    <RecordWithActions
      href={`/inventory/vendors/${vendor.id}`}
      visual={<IconVisual icon={Truck} />}
      title={<span className="block line-clamp-2 whitespace-normal break-words">{vendor.name}</span>}
      subtitle={vendorContactLines(vendor).map((line) => (
        <span key={line} className="block truncate">
          {line}
        </span>
      ))}
      status={vendor.active ? null : <StatusPill tone="neutral" label="Inactive" />}
      meta={
        <>
          <MetaChip icon={Package}>{vendor.productCount} {vendor.productCount === 1 ? "product" : "products"}</MetaChip>
          <MetaChip icon={ClipboardList}>{vendor.openPoCount} open {vendor.openPoCount === 1 ? "order" : "orders"}</MetaChip>
        </>
      }
      actions={<VendorActions vendor={vendor} strip />}
    />
  );
}
