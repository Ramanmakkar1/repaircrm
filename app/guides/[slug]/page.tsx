import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GUIDES, guideBySlug, sectionId } from "@/components/marketing/content/guides";
import { ClosingCta, FaqSection, Note, PageHero, Related, WRAP } from "@/components/marketing/parts";
import { relatedFeatureLinks } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { cn } from "@/components/ui/cn";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { OPERATOR, formatLongDate } from "@/lib/seo/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  const metadata = pageMetadata({
    title: guide.metaTitle,
    description: guide.metaDescription,
    path: `/guides/${guide.slug}`,
  });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      publishedTime: guide.published,
      modifiedTime: guide.updated,
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const path = `/guides/${guide.slug}`;
  const trail = [
    { name: "Guides", path: "/guides" },
    { name: guide.name, path },
  ];
  const others = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 1);

  return (
    <MarketingShell>
      <JsonLd
        data={[
          breadcrumbSchema(trail),
          articleSchema({
            path,
            headline: guide.h1,
            description: guide.metaDescription,
            published: guide.published,
            updated: guide.updated,
          }),
          faqSchema(guide.faqs),
        ]}
      />
      <PageHero trail={trail} eyebrow="Guide" title={guide.h1} lede={<p>{guide.answer}</p>}>
        <p className="text-[13px] text-neutral-600">
          By {OPERATOR.name} · Published <time dateTime={guide.published}>{formatLongDate(guide.published)}</time>
          {guide.updated !== guide.published ? (
            <>
              {" "}
              · Updated <time dateTime={guide.updated}>{formatLongDate(guide.updated)}</time>
            </>
          ) : null}
        </p>
      </PageHero>

      <div className={cn(WRAP, "grid gap-10 pb-16 sm:pb-20 lg:grid-cols-12 lg:gap-14")}>
        <nav aria-label="In this guide" className="lg:col-span-4">
          <div className="rounded-2xl bg-(--site-tray) p-5 sm:p-6 lg:sticky lg:top-24">
            <p className="text-[15px] font-semibold text-neutral-900">In this guide</p>
            <ol className="mt-3 space-y-2 text-[15px] leading-snug">
              {guide.sections.map((section) => (
                <li key={section.heading}>
                  <a href={`#${sectionId(section.heading)}`} className="text-neutral-700 underline-offset-4 hover:underline">
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="min-w-0 max-w-[68ch] lg:col-span-8">
          {guide.sections.map((section) => (
            <section key={section.heading} aria-labelledby={sectionId(section.heading)} className="mb-12 scroll-mt-24">
              <h2
                id={sectionId(section.heading)}
                className="scroll-mt-24 text-[26px] font-semibold leading-tight tracking-tight text-neutral-900"
              >
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-neutral-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.list ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.steps ? (
                  <ol className="space-y-4">
                    {section.steps.map((step, i) => (
                      <li key={step.title} className="flex gap-4">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--site-tray) text-[14px] font-semibold text-(--site-accent-ink)"
                        >
                          {i + 1}
                        </span>
                        <div>
                          <h3 className="text-[17px] font-semibold tracking-tight text-neutral-900">{step.title}</h3>
                          <p className="mt-1">{step.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {section.sample ? (
                  <blockquote className="rounded-2xl border-l-4 border-(--site-accent-ink) bg-(--site-tray) p-5 text-[16px] text-neutral-800">
                    {section.sample}
                  </blockquote>
                ) : null}
              </div>
            </section>
          ))}

          <Note title="In Repairs helper">
            <div className="space-y-3">
              {guide.inApp.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p>
                <Link href="/features" className="underline underline-offset-4">
                  See all features
                </Link>{" "}
                or{" "}
                <Link href="/pricing" className="underline underline-offset-4">
                  how pricing works
                </Link>
                .
              </p>
            </div>
          </Note>
        </article>
      </div>

      <FaqSection faqs={guide.faqs} />
      <Related
        links={[
          ...relatedFeatureLinks(guide.related).slice(0, 2),
          ...others.map((g) => ({ href: `/guides/${g.slug}`, title: g.name, body: g.summary })),
        ]}
      />
      <ClosingCta
        title="Run your repair counter on Repairs helper"
        body="Check devices in, track repairs, sell over the counter and keep customers updated. Free during early access."
      />
    </MarketingShell>
  );
}
