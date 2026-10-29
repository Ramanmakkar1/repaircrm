import Link from "next/link";
import { ArrowRight, ArrowUp } from "lucide-react";
import { RepairPilotWordmark } from "@/components/brand/repairpilot";
import { BrandMark } from "./brand";
import { SUPPORT_EMAIL } from "./trust";

/**
 * Hrefs are root-relative ("/#pricing" style for home-page sections) so the
 * footer can sit on any public page.
 */
export const FOOTER_GROUPS = [
  { title: "Product", links: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Repair management", href: "/#check-in" },
    { label: "Sales & payments", href: "/#payments" },
    { label: "Stock & purchasing", href: "/#stock" },
    { label: "The shop helper", href: "/#assistant" },
    { label: "Splitforms integration", href: "/#splitforms" },
  ] },
  { title: "Company", links: [
    { label: "Contact", href: "/contact" },
    { label: "Compare with RepairShopr", href: "/compare/repairshopr-alternative" },
    { label: "Common questions", href: "/#faq" },
    { label: "Report an issue or idea", href: "/feedback" },
    { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  ] },
  { title: "Account", links: [
    { label: "Start free", href: "/signup" },
    { label: "Sign in", href: "/login" },
    { label: "Check your repair", href: "/portal" },
    { label: "Privacy policy", href: "/privacy" },
    { label: "Terms of service", href: "/terms" },
  ] },
] as const;

/** Dynamic route: the server supplies the current copyright year. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-container">
        <div className="site-footer-top">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo" aria-label="Repairs helper home">
              <BrandMark className="size-12" />
              <RepairPilotWordmark className="text-2xl" />
            </Link>
            <p>Less admin.<br />More time for the next repair.</p>
            <span>Repair tickets, counter sales and stock for independent phone, computer and device repair shops. Built by Town Media Labs in Edmonton, Alberta, Canada.</span>
            <Link href="/signup" className="site-text-link">
              Start free <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="site-footer-links">
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.title} aria-label={`Footer ${group.title.toLowerCase()}`}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.href.includes("#") || link.href.startsWith("mailto:") ? (
                        <a href={link.href}>{link.label}</a>
                      ) : (
                        <Link href={link.href}>{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="site-footer-bottom">
          <span>© {year} Repairs helper · Town Media Labs, Edmonton, Alberta</span>
          <span>Free during early access. No credit card needed.</span>
          <a href="#top">Back to top <ArrowUp size={15} aria-hidden="true" /></a>
        </div>
        <p className="site-footer-credit">
          Website design by{" "}
          <a href="https://kiwitechlabs.com" target="_blank" rel="noopener noreferrer">
            kiwitechlabs.com<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
