import { COMPARE_PAGES } from "@/components/marketing/content/compare";
import { FEATURE_PAGES } from "@/components/marketing/content/features";
import { GUIDES } from "@/components/marketing/content/guides";
import { SOFTWARE_PAGES } from "@/components/marketing/content/software";

/**
 * Every indexable public path, in sitemap order. Signed-in screens, the
 * portal and shop-specific pages are deliberately absent.
 */
export const PUBLIC_PATHS: string[] = [
  "/",
  "/features",
  ...FEATURE_PAGES.map((page) => `/features/${page.slug}`),
  ...SOFTWARE_PAGES.map((page) => `/software/${page.slug}`),
  "/free-repair-shop-software",
  "/compare",
  ...COMPARE_PAGES.map((page) => `/compare/${page.slug}`),
  "/guides",
  ...GUIDES.map((guide) => `/guides/${guide.slug}`),
  "/pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/delete-account",
];

/**
 * Real content dates for the sitemap: when a guide was last updated, or when
 * a comparison's competitor details were last checked. Pages without a date
 * of their own are left undated rather than given an invented one.
 */
export const PATH_DATES: Record<string, string> = Object.fromEntries([
  ...GUIDES.map((guide) => [`/guides/${guide.slug}`, guide.updated]),
  ...COMPARE_PAGES.map((page) => [`/compare/${page.slug}`, page.checked]),
]);
