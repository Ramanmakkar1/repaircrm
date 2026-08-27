import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { LeadForm } from "@/components/leads/lead-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New lead · RepairFlow" };

export default async function NewLeadPage() {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
      <Link
        href="/leads"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Leads
      </Link>

      <PageHeader
        title="New lead"
        description="Someone rang about a repair. Take a name and a way to reach them — everything else can wait."
      />

      <LeadForm />
    </div>
  );
}
