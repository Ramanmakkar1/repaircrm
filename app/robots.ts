import type { MetadataRoute } from "next";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

/**
 * Crawl rules. Every signed-in screen is already `noindex` (the root layout
 * default) and redirects visitors to sign-in; disallowing them here just stops
 * crawlers spending time on pages that can never rank.
 *
 * Deliberately NOT disallowed:
 *  - /login and /signup: noindex, but crawlers should be able to see that.
 *  - /s/<shop>: a shop's public page, indexable when its owner opts in.
 *  - /shop-logo, /images, /icons, /brand, /marketing/<files>: assets that
 *    public pages render. The signed-in campaigns screen shares the
 *    /marketing prefix, so only its own routes are listed (with `$`).
 */
const DISALLOW = [
  "/api/",
  // Signed-in workspace (app/(app))
  "/appointments",
  "/assistant",
  "/counter",
  "/customers",
  "/dashboard",
  "/display",
  "/estimates",
  "/inventory",
  "/invoices",
  "/leads",
  "/marketing$",
  "/marketing/new",
  "/pos",
  "/reports",
  "/scan",
  "/settings",
  "/setup",
  "/staff-switch",
  "/tickets",
  "/time-clock",
  "/voice",
  // Account flows that have nothing to offer a search result
  "/change-password",
  "/email-code",
  "/forgot-password",
  "/logout",
  "/reset-password",
  "/session-expired",
  // Per-customer, per-shop and admin surfaces
  "/checkin/",
  "/files/",
  "/offline",
  "/platform",
  "/portal",
  "/print/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOW },
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
