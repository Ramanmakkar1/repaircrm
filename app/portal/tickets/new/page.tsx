import { db } from "@/lib/db";
import { deviceKindsFor, kindPicture, problemPicturesFor, visibleDeviceKinds } from "@/lib/intake-options";
import { devicePicture } from "@/lib/portal-display";
import { requirePortalCustomer } from "@/lib/portal-session";
import { problemTypes } from "@/components/tickets/ticket-meta";
import { NewRequestForm } from "@/components/portal/new-request-form";
import { BackLink, PortalShell } from "../../_components/shell";
import { loadPortalShop } from "../../_components/shop";

export const metadata = { title: "New repair request · Repairs helper" };

/**
 * "Something else has broken": the customer's own way in, in the same picture
 * boxes the shop's New repair screen uses (which device, what is wrong, a few
 * words), one question at a time.
 *
 * The device list, the device kinds and the problem boxes are all read through
 * the portal cookie's ids, so this page cannot show (or offer) anything
 * belonging to another customer or another shop.
 */
export default async function NewPortalTicketPage() {
  const customer = await requirePortalCustomer("/portal/tickets/new");

  const [shop, assets] = await Promise.all([
    loadPortalShop(customer.shopId),
    db.asset.findMany({
      where: { customerId: customer.id, shopId: customer.shopId },
      orderBy: { createdAt: "desc" },
      // Kind, make and model only: never the unlock code or the serial.
      select: { id: true, type: true, make: true, model: true },
    }),
  ]);

  const problems = problemTypes(customer.shop.settings);

  return (
    <PortalShell shop={shop} customerName={`${customer.firstName} ${customer.lastName}`.trim()}>
      <BackLink href="/portal/home">Back to your repairs</BackLink>
      <NewRequestForm
        shopName={shop.name}
        devices={assets.map((asset) => ({
          id: asset.id,
          label: [asset.make, asset.model].filter(Boolean).join(" ") || asset.type,
          type: asset.type,
          photo: devicePicture(asset),
        }))}
        kinds={visibleDeviceKinds(deviceKindsFor(customer.shop.settings)).map((kind) => ({
          label: kind.label,
          type: kind.type,
          photo: kindPicture(kind)?.image ?? null,
        }))}
        problemTypes={problems}
        problemPictures={problemPicturesFor(customer.shop.settings, problems)}
      />
    </PortalShell>
  );
}
