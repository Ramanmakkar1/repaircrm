import Link from "next/link";
import { ArrowRight, ArrowUp } from "lucide-react";
import { RepairPilotWordmark } from "@/components/brand/repairpilot";
import { BrandMark } from "./brand";

export const FOOTER_GROUPS = [
  { title: "Product", links: [
    { label: "All features", href: "#features" },
    { label: "Repair management", href: "#check-in" },
    { label: "Sales & payments", href: "#payments" },
    { label: "Inventory & purchasing", href: "#stock" },
    { label: "AI helper", href: "#assistant" },
    { label: "Mobile, tablet & desktop", href: "#devices" },
  ] },
  { title: "Get started", links: [
    { label: "Create your shop", href: "/signup" },
    { label: "Sign in", href: "/login" },
    { label: "Early-access pricing", href: "#pricing" },
    { label: "Common questions", href: "#faq" },
  ] },
  { title: "Resources", links: [
    { label: "Splitforms integration", href: "#splitforms" },
    { label: "Report an issue or idea", href: "/feedback" },
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
            <a href="#top" className="site-footer-logo">
              <BrandMark className="size-12" />
              <RepairPilotWordmark className="text-2xl" />
            </a>
            <p>Less admin.<br />More time for the next repair.</p>
            <span>Repairs, sales, stock and an AI helper for independent phone, computer and device repair shops.</span>
            <Link href="/signup" className="site-text-link">
              Get started free <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="site-footer-links">
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.title} aria-label={`Footer ${group.title.toLowerCase()}`}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("#") ? (
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
          <span>© {year} Repairs helper · Townmedia Labs</span>
          <span>Free during early access. No credit card needed.</span>
          <a href="#top">Back to top <ArrowUp size={15} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  );
}
