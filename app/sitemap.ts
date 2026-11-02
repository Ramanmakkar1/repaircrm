import type { MetadataRoute } from "next";
import { PATH_DATES, PUBLIC_PATHS } from "@/lib/seo/pages";
import { absoluteUrl } from "@/lib/seo/site";

/** Public pages only. Only pages with a real content date carry lastModified. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) =>
    PATH_DATES[path] ? { url: absoluteUrl(path), lastModified: PATH_DATES[path] } : { url: absoluteUrl(path) },
  );
}
