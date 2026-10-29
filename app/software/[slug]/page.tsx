import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SOFTWARE_PAGES, softwareBySlug } from "@/components/marketing/content/software";
import {
  Band,
  ClosingCta,
  FaqSection,
  HeroActions,
  Note,
  PageHero,
  PointGrid,
  Related,
  Shot,
  Steps,
} from "@/components/marketing/parts";
import { PRICING_LINK, relatedFeatureLinks } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const dynamicParams = false;

export function generateStaticParams() {
  return SOFTWARE_PAGES.map((page) => ({ slug: page.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = softwareBySlug((await params).slug);
  if (!page) return {};
  return pageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/software/${page.slug}`,
  });
}

export default async function SoftwarePage({ params }: Props) {
  const page = softwareBySlug((await params).slug);
  if (!page) notFound();
  // There is no /software index; the trail runs through Features, where these pages are listed.
  const trail = [
    { name: "Features", path: "/features" },
    { name: page.name, path: `/software/${page.slug}` },
  ];

  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(page.faqs)]} />
      <PageHero trail={trail} eyebrow={page.name} title={page.h1} lede={<p>{page.lede}</p>}>
        <HeroActions secondary={{ href: "/features", label: "See all features" }} />
      </PageHero>

      <div className="mx-auto w-full max-w-[1184px] px-5 pb-16 sm:px-8">
        <Shot shot={page.shot} caption={page.shotCaption} priority />
      </div>

      <Band id="day" tone="tray" title={page.dayTitle} intro={<p>{page.dayIntro}</p>}>
        <Steps steps={page.day} />
      </Band>

      <Band id="fit" title={page.fitTitle}>
        <PointGrid points={page.fit} />
        <div className="mt-12 max-w-3xl">
          <Note title="What it does not do (yet)">
            <ul className="list-disc space-y-1.5 pl-5">
              {page.limits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Note>
        </div>
      </Band>

      <FaqSection faqs={page.faqs} />
      <Related
        links={[...relatedFeatureLinks(page.related).slice(0, 2), PRICING_LINK]}
        title="Read more about the features"
      />
      <ClosingCta
        title="Set it up for your shop"
        body="Add your device types, problem list and products, then check in your next repair. Free during early access."
      />
    </MarketingShell>
  );
}
