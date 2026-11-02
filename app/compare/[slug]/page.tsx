import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  COMPARE_PAGES,
  OUR_DIFFERENCES,
  compareBySlug,
  type ComparePage,
} from "@/components/marketing/content/compare";
import {
  Band,
  ClosingCta,
  FaqSection,
  HeroActions,
  Note,
  PageHero,
  PointGrid,
  Related,
} from "@/components/marketing/parts";
import { CONTACT_LINK, PRICING_LINK } from "@/components/marketing/related";
import { MarketingShell } from "@/components/marketing/shell";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { formatLongDate } from "@/lib/seo/site";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARE_PAGES.map((page) => ({ slug: page.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = compareBySlug((await params).slug);
  if (!page) return {};
  return pageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/compare/${page.slug}`,
  });
}

function Source({ page, ids }: { page: ComparePage; ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <a
          key={id}
          href={page.sources[id].href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-[12px] text-neutral-600 underline underline-offset-2"
        >
          Source: {page.sources[id].label}
        </a>
      ))}
    </>
  );
}

export default async function ComparePageRoute({ params }: Props) {
  const page = compareBySlug((await params).slug);
  if (!page) notFound();
  const checked = `checked ${formatLongDate(page.checked)}`;
  const trail = [
    { name: "Compare", path: "/compare" },
    { name: `${page.competitor} alternative`, path: `/compare/${page.slug}` },
  ];

  return (
    <MarketingShell>
      <JsonLd data={[breadcrumbSchema(trail), faqSchema(page.faqs)]} />
      <PageHero trail={trail} eyebrow="Compare" title={page.h1} lede={<p>{page.lede}</p>}>
        <HeroActions secondary={{ href: "/pricing", label: "Repairs helper pricing" }} />
      </PageHero>

      <Band
        id="table"
        tone="tray"
        title="Side by side"
        intro={
          <p>
            {page.competitor} details are paraphrased from the linked pages, {checked}. Prices are as listed
            there. Where we could not confirm a {page.competitor} detail, it is left out rather than guessed.
          </p>
        }
      >
        <div className="rounded-2xl bg-white md:overflow-x-auto">
          {/* Below md each row stacks into a card with its own labels; the header row is visually hidden. */}
          <table className="w-full border-collapse text-left text-[14px] leading-relaxed max-md:block md:min-w-[640px]">
            <caption className="sr-only">
              Repairs helper and {page.competitor} compared, {checked}
            </caption>
            <thead className="max-md:sr-only">
              <tr className="border-b border-neutral-200">
                <th scope="col" className="w-[22%] p-4 font-semibold text-neutral-900">
                  Topic
                </th>
                <th scope="col" className="w-[39%] p-4 font-semibold text-neutral-900">
                  Repairs helper
                </th>
                <th scope="col" className="w-[39%] p-4 font-semibold text-neutral-900">
                  {page.competitor} (from its website)
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {page.rows.map((row) => (
                <tr
                  key={row.topic}
                  className="border-b border-neutral-100 align-top last:border-0 max-md:block max-md:px-1 max-md:py-3"
                >
                  <th
                    scope="row"
                    className="p-4 font-medium text-neutral-900 max-md:block max-md:pb-1 max-md:text-[16px]"
                  >
                    {row.topic}
                  </th>
                  <td className="p-4 text-neutral-700 max-md:block max-md:py-1.5">
                    <span className="block text-[12px] font-semibold text-neutral-900 md:hidden">Repairs helper</span>
                    {row.ours}
                  </td>
                  <td className="p-4 text-neutral-700 max-md:block max-md:py-1.5">
                    <span className="block text-[12px] font-semibold text-neutral-900 md:hidden">
                      {page.competitor}
                    </span>
                    {row.theirs}
                    <Source page={page} ids={row.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      <Band id="fit" title={`When ${page.competitor} may suit you better`}>
        <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-neutral-700">
          {page.theirFit.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Band>

      <Band id="different" tone="tray" title="What Repairs helper does differently">
        <PointGrid points={OUR_DIFFERENCES} />
        <div className="mt-10 max-w-3xl">
          <Note title="Sources">
            <ul className="space-y-1.5">
              {Object.values(page.sources).map((source) => (
                <li key={source.href}>
                  <a href={source.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {source.label}
                  </a>{" "}
                  ({checked})
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Repairs helper details come from the product itself; see{" "}
              <Link href="/features" className="underline underline-offset-4">
                all features
              </Link>
              .
            </p>
          </Note>
        </div>
      </Band>

      <FaqSection faqs={page.faqs} title="Switching questions" />
      <Related
        links={[
          PRICING_LINK,
          {
            href: "/compare",
            title: "More comparisons",
            body: "Repairs helper next to other repair shop software, using each company's own published details.",
          },
          CONTACT_LINK,
        ]}
      />
      <ClosingCta
        title="Try Repairs helper next to what you use now"
        body="Create a shop, import a few customers and products from a CSV, and run a test repair through to pickup."
      />
    </MarketingShell>
  );
}
