import type { MetadataRoute } from "next";
import { PUBLIC_SITE_URL } from "@/lib/public-site";

/** Public pages only. Dates are omitted rather than inventing modification times. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms"].map((path) => ({
    url: `${PUBLIC_SITE_URL}${path}`,
  }));
}
