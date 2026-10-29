import type { MetadataRoute } from "next";
import { PUBLIC_PATHS } from "@/lib/seo/pages";
import { absoluteUrl } from "@/lib/seo/site";

/** Public pages only. Dates are omitted rather than inventing modification times. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(path) }));
}
