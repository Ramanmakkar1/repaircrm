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

/** "2026-10-28" → "October 28, 2026", independent of the server's time zone. */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
