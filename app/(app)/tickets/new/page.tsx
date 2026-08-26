import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { TicketForm, type Option } from "@/components/tickets/ticket-form";
import {
  assetLabel,
  customerLabel,
  problemTypes,
} from "@/components/tickets/ticket-meta";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const rawCustomerId = params.customerId;
  const prefillId =
    (Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId) ?? "";

  const [customers, techs, shop] = await Promise.all([
    db.customer.findMany({
      where: { shopId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessName: true,
        // Only display-safe asset fields — `password` (device unlock code) is
        // deliberately not selected, since this map is serialised to the client.
        assets: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            make: true,
            model: true,
            serial: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.shop.findUnique({ where: { id: shopId }, select: { settings: true } }),
  ]);

  if (customers.length === 0) {
    // Nothing to attach a ticket to yet — the customers module owns that flow.
    notFound();
  }

  const assetsByCustomer: Record<string, Option[]> = {};
  for (const customer of customers) {
    assetsByCustomer[customer.id] = customer.assets.map((asset) => ({
      value: asset.id,
      label: assetLabel(asset),
    }));
  }

  // A prefill id from another shop is simply ignored rather than 404-ing the page.
  const defaultCustomerId = customers.some((c) => c.id === prefillId)
    ? prefillId
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="New Ticket"
        description="Check a device in and start the repair clock."
      />
      <TicketForm
        customers={customers.map((customer) => ({
          value: customer.id,
          label: customerLabel(customer),
        }))}
        assetsByCustomer={assetsByCustomer}
        techs={techs.map((tech) => ({ value: tech.id, label: tech.name }))}
        problemTypes={problemTypes(shop?.settings)}
        defaultCustomerId={defaultCustomerId}
      />
    </div>
  );
}
