import type { Metadata } from "next";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  commitCustomerImportAction,
  previewCustomerImportAction,
} from "./actions";

export const metadata: Metadata = { title: "Import customers · RepairPilot" };

export default async function ImportCustomersPage() {
  // Front desk keeps the customer book, so they can bring one in too.
  await requireRole("OWNER", "FRONT_DESK");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: "Import" },
        ]}
        title="Import customers"
        description="Bring a customer list over from a spreadsheet or another system, one file at a time."
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
