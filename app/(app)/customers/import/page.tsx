import type { Metadata } from "next";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  commitCustomerImportAction,
  previewCustomerImportAction,
} from "./actions";

export const metadata: Metadata = { title: "Import customers · Repairs helper" };

export default async function ImportCustomersPage() {
  // Front desk keeps the customer book, so they can bring one in too.
  await requireRole("OWNER", "FRONT_DESK");

  return (
    // Same header as the product import: the top bar carries Back, so no breadcrumb trail here.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <PageHeader
        title="Import customers"
        description="Bring your customer list over from a spreadsheet or another system."
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
