import * as React from "react";
import Link from "next/link";
import { MessageSquare, Package, Printer, Receipt, StickyNote } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { PartOrderDialog, type PartProductOption, type PartVendorOption } from "./part-order-dialog";
import { JobPhotoTile } from "./job-photo-tile";
import { jobTabHref, type JobInvoice } from "./job-screen-logic";
import { TILE_CLASS as TILE, TileFace } from "./job-tile";
import { MakeInvoiceButton } from "./ticket-actions";

type InvoiceProps = React.ComponentProps<typeof MakeInvoiceButton>;

/**
 * The six things people do to a repair at the counter, as tiles: a picture-sized
 * icon in a soft square and one plain word, 48px or more in every direction.
 *
 *   Add part     opens the same "Order a part" form the Parts card has
 *   Add photo    the camera, the same dialog as Take photo (the file picker where there is no camera)
 *   Message      the composer, as a message to the customer
 *   Add note     the composer, as a private note
 *   Invoice      opens the repair's invoice, or the same "Make invoice" dialog
 *   Print        the work order
 *
 * A plain grid, so all six are on screen at once and nothing scrolls sideways:
 * three columns (two rows) on a phone and in the side panel, one row of six on
 * a tablet held upright.
 */
export function JobQuickActions({
  ticketId,
  products,
  vendors,
  invoice,
  invoiceProps,
}: {
  ticketId: string;
  products: PartProductOption[];
  vendors: PartVendorOption[];
  invoice: JobInvoice | null;
  invoiceProps: Omit<InvoiceProps, "trigger" | "label" | "triggerNode">;
}) {
  const nothingToBill = invoiceProps.chargeCount === 0 && invoiceProps.unbilledTimeCount === 0;

  return (
    <section aria-label="Quick actions" className="lg:order-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
        <PartOrderDialog
          ticketId={ticketId}
          products={products}
          vendors={vendors}
          trigger={
            <button type="button" className={TILE}>
              <TileFace icon={Package} label="Add part" />
            </button>
          }
        />
        <JobPhotoTile ticketId={ticketId} />
        <Link href={jobTabHref(ticketId, "updates", "message")} className={TILE} data-touch-control>
          <TileFace icon={MessageSquare} label="Message customer" />
        </Link>
        <Link href={jobTabHref(ticketId, "updates", "note")} className={TILE} data-touch-control>
          <TileFace icon={StickyNote} label="Add note" />
        </Link>
        {invoice ? (
          <Link href={`/invoices/${invoice.id}`} className={TILE} data-touch-control>
            <TileFace icon={Receipt} label={`Invoice #${invoice.number}`} />
          </Link>
        ) : (
          <MakeInvoiceButton
            {...invoiceProps}
            triggerNode={
              <button
                type="button"
                className={cn(TILE, "disabled:opacity-50")}
                disabled={nothingToBill}
                title={nothingToBill ? "Add a charge or log time first" : undefined}
              >
                <TileFace icon={Receipt} label="Create invoice" />
                {nothingToBill ? <span className="sr-only">Add a charge or log time first</span> : null}
              </button>
            }
          />
        )}
        <Link href={`/print/tickets/${ticketId}`} className={TILE} data-touch-control>
          <TileFace icon={Printer} label="Print" />
        </Link>
      </div>
    </section>
  );
}
