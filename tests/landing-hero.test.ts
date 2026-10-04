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
  it("preserves the approved headline and serif emphasis", () => {
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain('<span class="site-serif">repair shop</span>');
    expect(out).toContain("on one calm screen");
    expect(out).toContain("font-size:clamp(36px, 8vw, 72px)");
  });
  it("uses a clean background without requesting the former sky media", () => {
    expect(out).not.toContain("<video");
    expect(out).not.toContain("/marketing/hero/");
    const css = read("components/landing/site.css");
    expect(css).not.toMatch(/site-poster|background-image|url\(/);
    expect(css).toContain("background: var(--site-hero)");
    expect(css).toContain("prefers-reduced-motion");
  });
  it("offers working signup and product links in a banner landmark", () => {
    expect(out).toContain("<header");
    expect(out).toContain('<nav aria-label="Main"');
    expect(out).toMatch(/href="\/signup"[^>]*>Start your shop/);
    expect(out).toContain('href="#product"');
    expect(out).toContain("No credit card needed");
  });
});

describe("navigation", () => {
  const out = html(React.createElement(Navbar));
  it("shows the panda identity and all product and account destinations", () => {
    expect(out).toContain("panda-repair-mark.webp");
    expect(out).toContain("Repairs ");
    for (const link of NAV_ITEMS) expect(out).toContain(`href="${link.href}"`);
    expect(out).toContain('href="/login"');
    expect(out).toContain('href="/signup"');
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
