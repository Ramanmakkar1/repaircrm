import { sampleCsvResponse } from "@/components/import/upload";

/** GET /customers/import/sample — the example file the upload step links to. */
export async function GET() {
  return sampleCsvResponse("customers");
}
