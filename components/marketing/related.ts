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
  href: "/compare/repairshopr-alternative",
  title: "Compared with RepairShopr",
  body: "A side-by-side look at features and published pricing, checked October 2026.",
};
export const CONTACT_LINK: RelatedLink = {
  href: "/contact",
  title: "Contact",
  body: "Questions before you sign up, support for your shop, privacy and security.",
};
