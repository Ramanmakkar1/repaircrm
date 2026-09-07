import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { activeLocations, newRecordLocationId } from "@/lib/location";
import { readSla } from "@/lib/sla";
import { activeWarrantiesByCustomer } from "@/lib/warranty";
import { PageHeader } from "@/components/ui/page-header";
import {
  TicketForm,
  type Option,
  type WarrantyOption,
} from "@/components/tickets/ticket-form";
import {
  assetLabel,
  customerLabel,
  problemTypes,
} from "@/components/tickets/ticket-meta";

export const metadata: Metadata = { title: "New ticket · RepairFlow" };

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId, userId } = await requireUser();
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

  const [locations, defaultLocationId, checklists, warranties] = await Promise.all([
    activeLocations(shopId),
    newRecordLocationId(shopId, userId),
    db.checklistTemplate.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    activeWarrantiesByCustomer(shopId),
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

  // Live warranties, per customer. Only the customer chosen in the form ever
  // shows any, but loading them here keeps the picker instant instead of
  // firing a request on every customer change — the same trick the asset map
  // above uses.
  const warrantiesByCustomer: Record<string, WarrantyOption[]> = {};
  for (const [customerId, rows] of warranties) {
    warrantiesByCustomer[customerId] = rows.map((row) => ({
      value: row.id,
      label: row.description,
      hint: `Invoice #${row.invoiceNumber} · expires ${format(row.expiresAt, "MMM d, yyyy")}`,
    }));
  }

  const sla = readSla(shop?.settings);

  // A prefill id from another shop is simply ignored rather than 404-ing the page.
  const defaultCustomerId = customers.some((c) => c.id === prefillId)
    ? prefillId
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Tickets", href: "/tickets" }, { label: "New ticket" }]}
        title="New ticket"
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
        locations={locations.map((location) => ({
          value: location.id,
          label: location.name,
        }))}
        defaultLocationId={defaultLocationId ?? undefined}
        checklists={checklists.map((checklist) => ({
          value: checklist.id,
          label: checklist.name,
        }))}
        warrantiesByCustomer={warrantiesByCustomer}
        slaHint={`Leave blank and we'll promise ${sla.NORMAL} calendar hours at Normal priority — set per priority in Settings → Workflow.`}
      />
    </div>
  );
}
