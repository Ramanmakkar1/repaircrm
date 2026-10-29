import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "Repairs helper pricing: free during early access";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ label: "Pricing", title: "Free during early access. No credit card." });
}
