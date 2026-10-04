import type { Metadata } from "next";
import Link from "next/link";

import { ImportWizard } from "@/components/import/import-wizard";
import { ACTIONS } from "@/components/ui/icons";
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
      <Link
        href="/inventory"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All inventory
      </Link>

      <PageHeader
        title="Import products"
        description="Load a parts catalogue from a spreadsheet. Vendors named in the file are created as you go."
        className="mb-4"
      />

      <ImportWizard
        kind="products"
        uploadUrl="/inventory/import/upload"
        sampleUrl="/inventory/import/sample"
        doneHref="/inventory"
        doneLabel="Open the catalogue"
        onPreview={previewProductImportAction}
        onCommit={commitProductImportAction}
        // Only offered when an AI provider is switched on — otherwise the button
        // would spend a daily allowance just to say it can't help.
        onSuggest={aiEnabled() ? suggestProductMappingAction : undefined}
      />
    </div>
  );
}
