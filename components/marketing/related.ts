import { FEATURE_PAGES } from "./content/features";
import type { RelatedLink } from "./parts";

/** Cards linking to feature pages, in the order given. */
export function relatedFeatureLinks(slugs: readonly string[]): RelatedLink[] {
  return slugs.flatMap((slug) => {
    const page = FEATURE_PAGES.find((p) => p.slug === slug);
    return page ? [{ href: `/features/${page.slug}`, title: page.name, body: page.summary }] : [];
  });
}

/** The site-level pages every marketing page can point to. */
export const PRICING_LINK: RelatedLink = {
  href: "/pricing",
  title: "Pricing",
  body: "Free during early access, with no card required. What is included and what costs extra.",
};
export const COMPARE_LINK: RelatedLink = {
  href: "/compare",
  title: "Compared with other software",
  body: "Repairs helper next to other repair shop software, using each company's own published pricing and features.",
};
export const CONTACT_LINK: RelatedLink = {
  href: "/contact",
  title: "Contact",
  body: "Questions before you sign up, support for your shop, privacy and security.",
};
