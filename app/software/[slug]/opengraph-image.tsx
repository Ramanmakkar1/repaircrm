import { SOFTWARE_PAGES, softwareBySlug } from "@/components/marketing/content/software";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/components/seo/og-image";

export const alt = "Repairs helper for your type of repair shop";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return SOFTWARE_PAGES.map((page) => ({ slug: page.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = softwareBySlug((await params).slug);
  return renderOgImage({ label: page?.name ?? "Repair shop software", title: page?.h1 ?? "Repair shop software" });
}
