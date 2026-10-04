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
  it("keeps one clear headline above a wide repair film", () => {
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain("Repair shop software.");
    expect(out).toContain("Built for your counter.");
    expect(out.indexOf("<h1")).toBeLessThan(out.indexOf("<video"));
  });
  it("shows a responsive poster without requesting video before checking visitor preferences", () => {
    const video = out.match(/<video[^>]*>/)![0];
    expect(video).not.toMatch(/\ssrc=/);
    expect(video).toContain('preload="none"');
    expect(video).toContain('aria-hidden="true"');
    expect(out).toContain("/marketing/repair-film/repair-poster.webp");
    expect(out).toContain("/marketing/repair-film/repair-poster-mobile.webp");
    expect(out).toContain("Film by Tima Miroshnichenko / Pexels");
    expect(out).not.toContain("/marketing/hero/");
  });
  it("offers working signup and product links in a banner landmark", () => {
    expect(out).toContain("<header");
    expect(out).toContain('<nav aria-label="Main"');
    expect(out).toMatch(/href="\/signup"[^>]*>Get started free/);
    expect(out).toContain('href="#product"');
    expect(out).toContain("No credit card needed");
  });
});

describe("navigation", () => {
  const out = html(React.createElement(Navbar));
  it("shows the panda identity and all product and account destinations", () => {
    expect(out).toContain("panda-symbol.svg");
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
