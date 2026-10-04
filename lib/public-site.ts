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
  name: "RepairsHelper",
  url: `${PUBLIC_SITE_URL}/`,
};

/** Descriptive product data; no invented ratings or rich-result eligibility claim. */
export const SOFTWARE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "RepairsHelper",
  url: `${PUBLIC_SITE_URL}/`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web browser",
  description: "Repair shop software for repair tickets, counter sales, inventory and customer updates, with AI tools and a shop helper.",
  featureList: ["Repair management", "Point of sale and payments", "Inventory and purchasing", "Customer repair portal", "AI ticket summaries and reply drafts", "Shop helper", "Mobile, tablet and desktop browser access"],
};
