import { COMPARE_PAGES } from "@/components/marketing/content/compare";
import { FEATURE_PAGES } from "@/components/marketing/content/features";
import { GUIDES } from "@/components/marketing/content/guides";
import { SOFTWARE_PAGES } from "@/components/marketing/content/software";

import { BRAND, OPERATOR, SUPPORT_EMAIL, absoluteUrl } from "./site";

/**
 * The /llms.txt file (llmstxt.org): a plain markdown map of the public site
 * for AI assistants, built from the same content as the pages so the two never
 * disagree. Facts here must also appear on the pricing and feature pages.
 */
export function llmsTxt(): string {
  const link = (title: string, path: string, note: string) => `- [${title}](${absoluteUrl(path)}): ${note}`;
  return [
    `# ${BRAND}`,
    "",
    `> ${BRAND} is repair shop software for independent phone, computer and electronics repair shops: repair tickets, estimates and invoices, a point of sale, inventory, a customer portal and an AI assistant, in the browser on a phone, tablet or computer. It is free during early access, with every staff account included and no credit card. It is built by ${OPERATOR.name} in ${OPERATOR.city}, ${OPERATOR.region}, Canada.`,
    "",
    "Key facts:",
    "",
    "- Price: $0 during early access, with no feature tiers, no per-seat charges and no credit card. Paid plans have not been announced and will be announced well before anything changes.",
    "- Costs from connected providers can apply: card processing (Stripe or Square), text messages (Twilio) and email sending.",
    "- Runs in any modern browser on phones, tablets and computers, with an Easy mode of large buttons for the counter.",
    "- Not available today: field jobs with customer addresses or routing, and one-step migration of repair history from another system. Customers and products import from CSV.",
    `- Contact: ${SUPPORT_EMAIL}`,
    "",
    "## Features",
    "",
    ...FEATURE_PAGES.map((page) => link(page.name, `/features/${page.slug}`, page.summary)),
    "",
    "## By type of shop",
    "",
    ...SOFTWARE_PAGES.map((page) => link(page.name, `/software/${page.slug}`, page.metaDescription)),
    link(
      "Free repair shop software",
      "/free-repair-shop-software",
      "What is free during early access, and what can still cost money.",
    ),
    "",
    "## Comparisons",
    "",
    ...COMPARE_PAGES.map((page) =>
      link(`${page.competitor} alternative`, `/compare/${page.slug}`, `${page.summary} Competitor details checked ${page.checked}.`),
    ),
    "",
    "## Guides",
    "",
    ...GUIDES.map((guide) => link(guide.name, `/guides/${guide.slug}`, guide.summary)),
    "",
    "## Company",
    "",
    link("Pricing", "/pricing", "Free during early access: what is included and which third-party fees can apply."),
    link("Contact", "/contact", "Questions before signing up, support, privacy and security."),
    "",
    "## Optional",
    "",
    link("Privacy policy", "/privacy", "How Repairs helper handles shop and customer data."),
    link("Terms of service", "/terms", "The terms for using Repairs helper."),
    "",
  ].join("\n");
}
