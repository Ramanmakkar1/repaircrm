import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroSection } from "@/components/landing/hero/hero-section";
import { DashboardPreview } from "@/components/landing/hero/dashboard-preview";
import { NAV_ITEMS, Navbar } from "@/components/landing/hero/navbar";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

describe("hero", () => {
  const out = html(React.createElement(HeroSection));
  it("keeps one clear headline above the real product", () => {
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain("Repair shop software");
    expect(out.indexOf("<h1")).toBeLessThan(out.indexOf("<img"));
    expect(out).not.toContain("<video");
    expect(out).not.toMatch(/helping hand|AI helper/);
  });
  it("leads with app screenshots, using the phone capture on phones", () => {
    expect(out).toContain("/marketing/app/home-tablet.webp");
    expect(out).toContain("/marketing/app/home-phone.webp");
    expect(out).toContain("/marketing/app/job-phone.webp");
    expect(out).toContain('media="(max-width: 639px)"');
    expect(out).toContain("Demo shop data");
    expect(out).not.toContain("/marketing/repair-film/");
  });
  it("offers one signup verb and an in-page product link", () => {
    expect(out).toMatch(/href="\/signup"[^>]*>Start free/);
    expect(out).toContain('href="#product"');
    expect(out).toContain("No credit card needed");
  });
});

describe("navigation", () => {
  const out = html(React.createElement(Navbar));
  it("shows the husky identity and all product and account destinations", () => {
    expect(out).toContain("husky-mark-blue.webp");
    expect(out).toContain("Repairs ");
    for (const link of NAV_ITEMS) expect(out).toContain(`href="${link.href}"`);
    for (const href of ["/features", "/pricing", "/contact", "/compare/repairshopr-alternative"]) {
      expect(NAV_ITEMS.map((l) => l.href)).toContain(href);
    }
    expect(NAV_ITEMS.map((l) => l.label)).not.toContain("Home");
    expect(out).toContain('href="/login"');
    expect(out).toContain('href="/signup"');
  });
  it("is sticky and shows Sign in outside the mobile menu", () => {
    expect(out).toMatch(/class="[^"]*sticky top-0/);
    const beforePanel = out.slice(0, out.search(/<div id="[^"]+" hidden/));
    expect(beforePanel).toMatch(/href="\/login"[^>]*>Sign in/);
  });
  it("connects the mobile menu button to a hidden panel", () => {
    const button = out.match(/<button[^>]*>/)![0];
    expect(button).toContain('aria-expanded="false"');
    const controls = button.match(/aria-controls="([^"]+)"/)![1];
    expect(out).toContain(`id="${controls}" hidden`);
    expect(button).toContain("h-11 w-11");
  });
  it("supports closing on selection, outside click and Escape with focus return", () => {
    const src = read("components/landing/hero/navbar.tsx");
    expect(src).toContain('"Escape"');
    expect(src).toContain("buttonRef.current?.focus()");
    expect(src).toContain("onClick={close}");
    expect(src).toContain('"pointerdown"');
  });
});

describe("real counter preview", () => {
  const out = html(React.createElement(DashboardPreview));
  it("provides responsive actual app screenshots with honest demo labeling", () => {
    expect(out).toContain("/marketing/app/home-tablet.webp");
    expect(out).toContain("/marketing/app/home-phone.webp");
    expect(out).toContain("(max-width: 639px)");
    expect(out).toContain("Demo shop data");
    expect(out).toContain("<figcaption");
    expect(out).not.toMatch(/<(button|input|select|textarea|a)[\s>]/);
  });
});
