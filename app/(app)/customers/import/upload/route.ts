import { handleImportUpload } from "@/components/import/upload";

/**
 * POST /customers/import/upload — step 1 of the customer importer.
 * Front desk staff maintain the customer book, so they can import it too.
 */
export async function POST(request: Request) {
  return handleImportUpload(request, "customers", ["OWNER", "FRONT_DESK"]);
}
