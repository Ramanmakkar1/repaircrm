import type { Metadata } from "next";

import { LeadForm } from "@/components/leads/lead-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New lead · RepairPilot" };

export default async function NewLeadPage() {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "New lead" }]}
        title="New lead"
        description="Someone rang about a repair. Take a name and a way to reach them — everything else can wait."
      />

      <LeadForm />
    </div>
  );
}
