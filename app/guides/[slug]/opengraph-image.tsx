import { GUIDES, guideBySlug } from "@/components/marketing/content/guides";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "A Repairs helper guide for repair shops";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  return renderOgImage({ label: "Guide", title: guide?.name ?? "Guides for repair shops" });
}
