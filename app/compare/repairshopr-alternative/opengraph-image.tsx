import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "Repairs helper compared with RepairShopr";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({ label: "Compare", title: "Repairs helper as a RepairShopr alternative" });
}
