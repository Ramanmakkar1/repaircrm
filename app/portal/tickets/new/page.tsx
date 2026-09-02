import { db } from "@/lib/db";
import { requirePortalCustomer } from "@/lib/portal-session";
import { problemTypes } from "@/components/tickets/ticket-meta";
import { NewRequestForm } from "@/components/portal/new-request-form";
import { BackLink, PortalShell } from "../../_components/shell";

export const metadata = { title: "Start a repair request · RepairFlow" };

/**
 * "Something else has broken" — the customer's own way in.
 *
 * Both the device list and the problem-type vocabulary are read through the
 * portal cookie's ids, so this page cannot show (or offer) anything belonging to
 * another customer or another shop.
 */
export default async function NewPortalTicketPage() {
  const customer = await requirePortalCustomer("/portal/tickets/new");

  const assets = await db.asset.findMany({
    where: { customerId: customer.id, shopId: customer.shopId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, make: true, model: true },
  });

  return (
    <PortalShell
      shopName={customer.shop.name}
      customerName={`${customer.firstName} ${customer.lastName}`}
    >
      <BackLink href="/portal/home">Back to your portal</BackLink>

      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          Start a repair request
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Tell {customer.shop.name} what&rsquo;s wrong and they&rsquo;ll get back
          to you — no need to call.
        </p>
      </div>

      <NewRequestForm
        devices={assets.map((asset) => ({
          id: asset.id,
          label:
            [asset.make, asset.model].filter(Boolean).join(" ") || asset.type,
          type: asset.type,
        }))}
        problemTypes={problemTypes(customer.shop.settings)}
      />
    </PortalShell>
  );
}
