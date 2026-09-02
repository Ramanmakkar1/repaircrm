import { handleImportUpload } from "@/components/import/upload";

/**
 * POST /inventory/import/upload — step 1 of the product importer.
 * Owner only: a product row carries cost, which the app hides from other roles.
 */
export async function POST(request: Request) {
  return handleImportUpload(request, "products", ["OWNER"]);
}
