import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  commitCustomerImportAction,
  previewCustomerImportAction,
} from "./actions";

export const metadata: Metadata = { title: "Import customers · RepairFlow" };

export default async function ImportCustomersPage() {
  // Front desk keeps the customer book, so they can bring one in too.
  await requireRole("OWNER", "FRONT_DESK");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
      <Link
        href="/customers"
        className="inline-flex w-fit items-center gap-1 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Customers
      </Link>

      <PageHeader
        title="Import customers"
        description="Bring a customer list over from a spreadsheet or another system, one file at a time."
        className="mb-4"
      />

      <ImportWizard
        kind="customers"
        uploadUrl="/customers/import/upload"
        sampleUrl="/customers/import/sample"
        doneHref="/customers"
        doneLabel="Open the customer list"
        onPreview={previewCustomerImportAction}
        onCommit={commitCustomerImportAction}
      />
    </div>
  );
}
