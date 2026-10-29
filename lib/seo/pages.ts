import { FEATURE_PAGES } from "@/components/marketing/content/features";
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
  "/compare/repairshopr-alternative",
  "/pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/delete-account",
];
