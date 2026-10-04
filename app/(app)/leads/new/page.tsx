import type { Metadata } from "next";

import { LeadForm } from "@/components/leads/lead-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { readUiPrefs } from "@/lib/prefs";

export const metadata: Metadata = { title: "New enquiry · Repairs helper" };

export default async function NewLeadPage() {
  await requireUser();
  const { simple } = await readUiPrefs();

  if (simple) {
    // Easy mode: the shell's Back and Home already lead out, so no breadcrumb; one title, one line.
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <PageHeader
          title="New enquiry"
          description="Someone asked about a repair. Take a name and a number; everything else can wait."
        />
        <LeadForm easy />
      </div>
    );
  }

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
