import { organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema";

import { JsonLd } from "./json-ld";

/**
 * Structured data for the home page: WebSite, Organization (the operator) and
 * the WebApplication with its real $0 early-access offer. Drop-in replacement
 * for the two inline <script> tags in app/page.tsx.
 */
export function HomeJsonLd() {
  return <JsonLd data={[websiteSchema(), organizationSchema(), softwareSchema()]} />;
}
