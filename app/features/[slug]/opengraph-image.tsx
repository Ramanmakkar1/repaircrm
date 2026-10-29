import { FEATURE_PAGES, featureBySlug } from "@/components/marketing/content/features";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "A Repairs helper feature";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = featureBySlug((await params).slug);
  return renderOgImage({ label: page?.name ?? "Features", title: page?.h1 ?? "Repair shop software" });
}
