import { ClipboardList, Package } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { InitialsVisual, MetaChip } from "@/components/ui/record-card";
import { vendorContactLines } from "./easy-lists";
import { RecordWithActions } from "./record-with-actions";
import { VendorActions } from "./vendor-actions";
import type { VendorCardData } from "./vendor-card";

/**
 * One supplier in the Easy-mode list: their initials (so a list of suppliers is
 * not a wall of identical icons), the name, how to reach them, how many parts
 * you buy from them, and what is on order only when something is. The card opens
 * the supplier (Call and Email are big buttons there); Edit and Deactivate sit
 * in the strip under it, and Deactivate asks first.
 */
export function VendorEasyCard({ vendor }: { vendor: VendorCardData }) {
  return (
    <RecordWithActions
      href={`/inventory/vendors/${vendor.id}`}
      visual={<InitialsVisual name={vendor.name} />}
      title={<span className="block line-clamp-2 whitespace-normal break-words">{vendor.name}</span>}
      subtitle={vendorContactLines(vendor).map((line) => (
        <span key={line} className="block truncate">
          {line}
        </span>
      ))}
      status={vendor.active ? null : <StatusPill tone="neutral" label="Inactive" />}
      meta={
        <>
          <MetaChip icon={Package}>{vendor.productCount} {vendor.productCount === 1 ? "part" : "parts"}</MetaChip>
          {vendor.openPoCount > 0 ? (
            <MetaChip icon={ClipboardList}>
              {vendor.openPoCount} {vendor.openPoCount === 1 ? "order" : "orders"} open
            </MetaChip>
          ) : null}
        </>
      }
      actions={<VendorActions vendor={vendor} strip />}
    />
  );
}
