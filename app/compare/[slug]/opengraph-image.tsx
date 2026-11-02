import { COMPARE_PAGES, compareBySlug } from "@/components/marketing/content/compare";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "Repairs helper compared with other repair shop software";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return COMPARE_PAGES.map((page) => ({ slug: page.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = compareBySlug((await params).slug);
  return renderOgImage({ label: "Compare", title: page?.h1 ?? "Repair shop software compared" });
}
