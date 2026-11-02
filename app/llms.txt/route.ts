import { llmsTxt } from "@/lib/seo/llms";

// Built once from the content files at build time.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
