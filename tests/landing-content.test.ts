import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/font only works inside the Next compiler; the page only needs the class names.
vi.mock("@/components/landing/fonts", () => ({
  manrope: { className: "font-manrope", variable: "var-manrope" },
}));

const { FAQS, Faq } = await import("@/components/landing/faq");
const { INCLUDED, NOT_YET, PRICE, Pricing } = await import("@/components/landing/pricing");
const { FOOTER_GROUPS, SiteFooter } = await import("@/components/landing/footer");
const { RepairsHome } = await import("@/components/landing/repairs-home");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) =>
  markup
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("pricing", () => {
  const out = html(React.createElement(Pricing));

  it("is one free early-access plan with no card and no invented tiers", () => {
    expect(PRICE).toBe("$0");
    expect(out).toContain("$0");
    expect(out).toContain("per shop, per month");
    expect(out).toContain("Early access");
    expect(out).toContain("No credit card");
    expect(out).toContain("announce them well before anything changes");
    expect(out).toContain('href="/signup"');
    expect(INCLUDED.length).toBeGreaterThanOrEqual(5);
    expect(out).not.toMatch(/\/(mo|month|yr|year)\b.*\$\d/);
    expect(out.match(/\$\d/g)).toHaveLength(1); // only the $0
  });

  it("keeps the honest caveats beside the price", () => {
    const joined = NOT_YET.join(" ");
    expect(joined).toMatch(/migration/i);
    expect(joined).toMatch(/Stripe and Square/);
    expect(joined).toMatch(/Email and SMS/);
    expect(joined).toMatch(/usage fees/);
    expect(out).toContain("Before you rely on these workflows");
  });
});

describe("faq", () => {
  const out = html(React.createElement(Faq));
  const all = FAQS.map((f) => `${f.q} ${f.a}`).join(" ");

  it("renders every question as a keyboard-operable <details>", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(8);
    expect(out.match(/<details/g)).toHaveLength(FAQS.length);
    expect(out.match(/<summary/g)).toHaveLength(FAQS.length);
    expect(out.match(/<details[^>]*open/g)).toHaveLength(1);
    expect(out).not.toContain("<script");
  });

  it("keeps the truthful caveats", () => {
    expect(all).toMatch(/connected AI provider/);
    expect(all).toMatch(/Stripe and Square payment connections are implemented, but they must be configured and tested/);
    expect(all).toMatch(/email and SMS providers must be set up/);
    expect(all).toMatch(/no one-click migration/);
    expect(all).toMatch(/complete archive of every record is not available yet/);
    expect(all).toMatch(/No\. There is no billing/);
    expect(all).toMatch(/Splitforms/);
    expect(all).toMatch(/Easy mode/);
  });
});

describe("footer", () => {
  const out = html(React.createElement(SiteFooter));

  it("keeps the existing links and the copyright year", () => {
    const hrefs = FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    for (const href of ["/login", "/portal", "/privacy", "/terms", "#pricing", "#assistant", "#payments", "/feedback", "#splitforms", "#features"]) {
      expect(hrefs).toContain(href);
      expect(out).toContain(`href="${href}"`);
    }
    expect(out).toContain(`© ${new Date().getFullYear()} Repairs helper`);
    expect(out).toContain("<footer");
  });
});

describe("the whole page", () => {
  const page = html(React.createElement(RepairsHome));
  const words = text(page);

  it("has one h1, a skip link, a main landmark and anchors that exist", () => {
    expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(page).toContain('href="#main"');
    expect(page.match(/<main[\s>]/g)).toHaveLength(1);
    expect(page).toContain('id="main"');
    expect(page.match(/<header/g)).toHaveLength(1);
    expect(page.match(/<footer/g)).toHaveLength(1);
    for (const id of ["product", "assistant", "pricing", "payments", "stock", "faq", "check-in", "devices", "features", "splitforms"]) {
      expect(page).toContain(`id="${id}"`);
    }
    const anchors = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== "main");
    for (const id of new Set(anchors)) expect(page).toContain(`id="${id}"`);
  });

  it("gives every section one h2 that names it", () => {
    const sections = page.match(/<section[^>]*aria-labelledby="([^"]+)"/g) ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(6);
    for (const s of sections) {
      const id = s.match(/aria-labelledby="([^"]+)"/)![1];
      expect(page).toMatch(new RegExp(`<h2 id="${id}"`));
    }
  });

  it("keeps heading treatments consistent", () => {
    for (const h of page.match(/<h2[\s\S]*?<\/h2>/g) ?? []) {
      expect((h.match(/site-serif/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the product caveats in plain sight", () => {
    expect(words).toMatch(/connected AI provider/);
    expect(words).toMatch(/voice input depends on your browser/);
    expect(words).toMatch(/Stripe and Square need your own account/);
    expect(words).toMatch(/email or SMS provider is set up/);
    expect(words).toMatch(/Free during early access/);
    expect(words).toMatch(/Demo shop data/);
  });

  it("has no invented customers, ratings, statistics or testimonials", () => {
    const tells = [
      /testimonial|trusted by|loved by|\brated\b|customer reviews|\bstars?\b|\u2605/i,
      /\b\d[\d,]*\+?\s+(shops|customers|users|stores|repairs fixed|businesses)\b/i,
      /\b(10x|\d+%\s+(faster|more|less))\b/i,
    ];
    for (const tell of tells) expect(words.match(tell)?.[0]).toBeUndefined();
  });

  it("does not use any of the slop tells", () => {
    expect(page).not.toMatch(/bg-clip-text|text-transparent|backdrop-blur|border-l-\d/);
    expect(page).not.toMatch(/IntersectionObserver|opacity-0/);
  });
});
