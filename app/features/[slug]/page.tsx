import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FEATURE_PAGES, featureBySlug } from "@/components/marketing/content/features";
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
import { relatedFeatureLinks } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = featureBySlug((await params).slug);
  if (!page) return {};
  return pageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/features/${page.slug}`,
  });
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const page = featureBySlug((await params).slug);
  if (!page) notFound();
  const trail = [
    { name: "Features", path: "/features" },
    { name: page.name, path: `/features/${page.slug}` },
  ];

  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(page.faqs)]} />
      <PageHero trail={trail} eyebrow={page.name} title={page.h1} lede={<p>{page.lede}</p>}>
        <HeroActions secondary={{ href: "/features", label: "See all features" }} />
      </PageHero>

      <div className="mx-auto grid w-full max-w-[1184px] items-start gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[1fr_auto]">
        <Shot shot={page.shot} caption={page.shotCaption} priority />
        {page.phoneShot ? (
          <div className="hidden lg:block lg:w-[260px]">
            <Shot shot={page.phoneShot.shot} caption={page.phoneShot.caption} phone />
          </div>
        ) : null}
      </div>

      <Band id="workflow" tone="tray" title={page.workflowTitle} intro={<p>{page.workflowIntro}</p>}>
        <Steps steps={page.steps} />
      </Band>

      <Band id="details" title={page.pointsTitle}>
        <PointGrid points={page.points} />
        <div className="mt-12 max-w-3xl">
          <Note title="Before you rely on it">
            <ul className="list-disc space-y-1.5 pl-5">
              {page.setup.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Note>
        </div>
      </Band>

      <FaqSection faqs={page.faqs} title={`${page.name}: common questions`} />
      <Related links={relatedFeatureLinks(page.related)} title="Related features" />
      <ClosingCta
        title="Try it on your own counter"
        body="Create a shop, add a test repair and see whether it fits how you work. It is free during early access."
      />
    </MarketingShell>
  );
}
