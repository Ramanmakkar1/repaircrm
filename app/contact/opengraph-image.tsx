import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "Contact Repairs helper";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ label: "Contact", title: "Talk to the people behind Repairs helper" });
}
