import { PUBLIC_SITE_URL } from "@/lib/public-site";

/** Facts every public page repeats. Keep the spelling of the name exact. */
export const BRAND = "Repairs helper";
export const SUPPORT_EMAIL = "support@repairshelper.com";
export const OPERATOR = {
  name: "Town Media Labs",
  url: "https://townmedialabs.ca",
  city: "Edmonton",
  region: "Alberta",
  country: "CA",
} as const;

/** Absolute URL on the public origin for a site path such as "/pricing". */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${PUBLIC_SITE_URL}/` : `${PUBLIC_SITE_URL}${path}`;
}
