import type { Metadata } from "next";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { aiEnabled } from "@/lib/ai/config";
import { requireRole } from "@/lib/auth";
import {
  commitProductImportAction,
  previewProductImportAction,
  suggestProductMappingAction,
} from "./actions";

export const metadata: Metadata = { title: "Import products · Repairs helper" };

export default async function ImportProductsPage() {
  // Owner only: a product row carries cost.
  await requireRole("OWNER");

  return (
    // Same header as the customer import: the top bar carries Back, so no second back link here.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <PageHeader
        title="Import products"
        description="Bring your parts and prices over from a spreadsheet. Suppliers named in it are added for you."
      />

      <ImportWizard
        kind="products"
        uploadUrl="/inventory/import/upload"
        sampleUrl="/inventory/import/sample"
        doneHref="/inventory"
        doneLabel="Open stock"
        onPreview={previewProductImportAction}
        onCommit={commitProductImportAction}
        // Only offered when an AI provider is switched on — otherwise the button
        // would spend a daily allowance just to say it can't help.
        onSuggest={aiEnabled() ? suggestProductMappingAction : undefined}
      />
    </div>
  );
}
