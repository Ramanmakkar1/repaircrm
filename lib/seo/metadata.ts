import type { Metadata } from "next";

import { BRAND } from "./site";

/**
 * Metadata for one public marketing page.
 *
 * The root layout keeps every route out of search by default, so each public
 * page opts in here. Share images come from the route's `opengraph-image`
 * file, which Next merges into `openGraph.images` on its own; X falls back to
 * og:image when no twitter:image is set.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  /** The full <title>, brand included. */
  title: string;
  description: string;
  /** Site path, e.g. "/pricing". Relative URLs resolve against metadataBase. */
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: BRAND,
      locale: "en_CA",
      title,
      description,
      url: path,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
