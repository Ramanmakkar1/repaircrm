/** One public origin for canonical links, structured data and crawl discovery. */
export const PUBLIC_SITE_URL = (() => {
  try {
    const url = new URL(
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://repairshelper.com",
    );
    if (url.protocol === "https:" || url.protocol === "http:")
      return url.origin;
  } catch {
    /* Use the public deployment when configuration is absent or invalid. */
  }
  return "https://repairshelper.com";
})();

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Repairs helper",
  url: `${PUBLIC_SITE_URL}/`,
};
