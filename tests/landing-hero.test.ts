import * as React from "react";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardPreview } from "@/components/landing/hero/dashboard-preview";
import {
  GAUGE_TICKS,
  Gauge,
  activeTickCount,
  gaugeTick,
} from "@/components/landing/hero/gauge";
import { HeroSection } from "@/components/landing/hero/hero-section";
import { HeroVideo } from "@/components/landing/hero/hero-video";
import {
  HERO_MOBILE_QUERY,
  HERO_POSTER_MOBILE_SRC,
  HERO_POSTER_SRC,
  HERO_VIDEO_MOBILE_SRC,
  HERO_VIDEO_ORIGINAL_URL,
  HERO_VIDEO_SRC,
  shouldLoadHeroVideo,
} from "@/components/landing/hero/hero-media";
import { NAV_ITEMS, Navbar } from "@/components/landing/hero/navbar";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
/** Every .ts / .tsx file under components/landing, as [path, source]. */
const landingSources = (dir = "components/landing"): [string, string][] =>
  readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? landingSources(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name)
        ? [[`${dir}/${e.name}`, read(`${dir}/${e.name}`)] as [string, string]]
        : [],
  );

const OWNER_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260424_064411_9e9d7f84-9277-41f4-ab10-59172d89e6be.mp4";
const POSTER = "/marketing/hero/hero-poster.webp";
const POSTER_MOBILE = "/marketing/hero/hero-poster-mobile.webp";

describe("hero section", () => {
  const out = html(React.createElement(HeroSection));

  it("has exactly one h1, with the italic serif key word", () => {
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    const h1 = out.match(/<h1[\s\S]*?<\/h1>/)![0];
    expect(h1).toContain('<span class="site-serif">repair shop</span>');
    expect(h1).toContain("<br/>");
    expect(h1).toContain("on one calm screen");
    expect(h1).toContain("font-size:clamp(36px, 8vw, 72px)");
    expect(h1).toContain("line-height:1.05");
    expect(h1).toContain("font-weight:500");
    expect(h1).toContain("letter-spacing:-0.02em");
  });

  it("keeps the owner's frame measurements and colours", () => {
    expect(out).toContain("h-[calc(100vh-24px)]");
    expect(out).toContain("sm:h-[calc(100vh-32px)]");
    expect(out).toContain("overflow-hidden");
    expect(out).toContain("bg-[#d9d9d9]");
    expect(out).toContain("rounded-2xl");
    expect(out).toContain("sm:rounded-3xl");
    expect(out).toContain("bg-white/10");
  });

  it("uses the owner's clip, hosted here (web encodes, first frame as the CSS-background poster), with every playback attribute", () => {
    expect(HERO_VIDEO_ORIGINAL_URL).toBe(OWNER_VIDEO);
    expect(HERO_VIDEO_SRC).toBe("/marketing/hero/hero.mp4");
    expect(HERO_VIDEO_MOBILE_SRC).toBe("/marketing/hero/hero-mobile.mp4");
    expect(HERO_POSTER_SRC).toBe(POSTER);
    expect(HERO_POSTER_MOBILE_SRC).toBe(POSTER_MOBILE);
    const video = out.match(/<video[^>]*>/)![0];
    // The file is attached after hydration, once the visitor's motion / data / screen settings are known
    // (see "hero video is only requested when affordable" below), so the server markup has no src.
    expect(video).not.toContain("src=");
    expect(read("components/landing/hero/hero-video.tsx")).toContain("HERO_VIDEO_SRC");
    // The poster is the CSS background (the first frame of the same clip); no poster attribute needed.
    expect(video).not.toContain("poster=");
    expect(out).toContain(`href="${POSTER}"`);
    expect(out).toContain(`href="${POSTER_MOBILE}"`);
    for (const attr of [
      "autoplay",
      "loop",
      "muted",
      "playsinline",
      "disableremoteplayback",
    ]) {
      // React writes camelCase prop names (autoPlay=""); HTML attribute names are case-insensitive.
      expect(video).toMatch(new RegExp(`\\s${attr}(=""|\\s|>)`, "i"));
    }
    expect(video).toContain('preload="auto"');
    expect(video).toContain('webkit-playsinline="true"');
    expect(video).toContain('x5-playsinline="true"');
    expect(video).toContain("object-cover");
    expect(video).toContain("pointer-events-none");
    expect(video).toContain("inset-0");
    expect(video).toContain("h-full");
    expect(video).toContain("w-full");
  });

  it("shows the badge and a dark 'Get started' pill to the sign-up route", () => {
    expect(out).toContain("Repairs helper");
    const cta = out.match(/<a[^>]*href="\/signup"[^>]*>(?:(?!<\/a>)[\s\S])*Get started[\s\S]*?<\/a>/)![0];
    expect(cta).toContain("bg-[#0b0f1a]");
    expect(cta).toContain("rounded-full");
    expect(cta).toContain("bg-white/15");
    expect(out).toContain("clamp(13px, 3.5vw, 16px)");
    expect(out).toContain("The all-in-one software for phone, computer and console repair shops");
  });

  it("is a banner landmark holding a labelled nav and the preview", () => {
    expect(out).toContain("<header");
    expect(out).toContain('<link rel="preload" as="image"');
    expect(out).toContain('<nav aria-label="Main"');
    expect(out).toContain('role="img"');
  });
});

describe("hero media is hosted here and light", () => {
  const size = (src: string) => statSync(new URL(`../public${src}`, import.meta.url)).size;

  it("ships the web encodes and posters, and they stay small", () => {
    expect(size(HERO_VIDEO_SRC)).toBeLessThan(5 * 1024 * 1024);
    expect(size(HERO_VIDEO_MOBILE_SRC)).toBeLessThan(1.5 * 1024 * 1024);
    expect(size(HERO_POSTER_SRC)).toBeLessThan(250 * 1024);
    expect(size(HERO_POSTER_MOBILE_SRC)).toBeLessThan(120 * 1024);
    expect(HERO_MOBILE_QUERY).toBe("(max-width: 767px)");
  });

  it("no longer depends on a third-party host for the hero", () => {
    for (const [file, source] of landingSources("components/landing")) {
      if (file.endsWith("hero-media.ts")) continue; // the only mention is the owner's original link, kept as a record
      expect(source, file).not.toMatch(/cloudfront\.net|images\.unsplash\.com/);
    }
    expect(HERO_VIDEO_ORIGINAL_URL).toContain("cloudfront.net");
  });
});

describe("hero video is only requested when affordable", () => {
  const base = { reducedMotion: false, saveData: false };

  it("loads for a normal visit, with or without a connection report", () => {
    expect(shouldLoadHeroVideo(base)).toBe(true);
    expect(shouldLoadHeroVideo({ ...base, effectiveType: "4g" })).toBe(true);
  });

  it("never loads for reduced motion, data saver, or a 2G / 3G connection", () => {
    expect(shouldLoadHeroVideo({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldLoadHeroVideo({ ...base, saveData: true })).toBe(false);
    expect(shouldLoadHeroVideo({ ...base, reducedMotion: true, saveData: true, effectiveType: "4g" })).toBe(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(shouldLoadHeroVideo({ ...base, effectiveType })).toBe(false);
    }
  });

  it("is a client component keeping every playback attribute, with no src in the first render", () => {
    const src = read("components/landing/hero/hero-video.tsx");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain("useSyncExternalStore");
    expect(src).toContain("prefers-reduced-motion: reduce");
    expect(src).toContain("saveData");
    const video = html(React.createElement(HeroVideo)).match(/<video[^>]*>/)![0];
    expect(video).not.toContain("src=");
    expect(video).toContain('preload="auto"');
    for (const attr of ["autoplay", "loop", "muted", "playsinline", "disableremoteplayback"]) {
      expect(video).toMatch(new RegExp(`\\s${attr}(=""|\\s|>)`, "i"));
    }
    expect(video).toContain('webkit-playsinline="true"');
    expect(video).toContain('x5-playsinline="true"');
  });
});

describe("corner radii", () => {
  // Real Tailwind sizes. app/globals.css clamps rounded-xl/2xl/3xl to 8/12/12px for the signed-in app
  // (@theme inline writes literal values), so site.css has to restore them for the website.
  const css = read("components/landing/site.css");
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.\\:]/g, "\\$&")}\\s*\\{\\s*border-radius:\\s*([\\d.]+rem)`))?.[1];

  it("restores 12 / 16 / 24px under .site", () => {
    expect(rule(".site .rounded-xl")).toBe("0.75rem");
    expect(rule(".site .rounded-2xl")).toBe("1rem");
    expect(rule(".site .rounded-3xl")).toBe("1.5rem");
  });

  it("restores the hero's sm:rounded-3xl (24px from 40rem up, 16px below)", () => {
    const media = css.match(/@media \(min-width: 40rem\)\s*\{\s*\.site \.sm\\:rounded-3xl\s*\{\s*border-radius:\s*([\d.]+rem)/);
    expect(media?.[1]).toBe("1.5rem");
  });

  it("stays outside every cascade layer, otherwise the theme utilities would win", () => {
    expect(css).not.toMatch(/@layer/);
  });

  it("has a rule for every rounded-xl / 2xl / 3xl class (and variant) the landing code uses", () => {
    const used = new Set<string>();
    for (const [, source] of landingSources()) {
      for (const m of source.matchAll(/(?<![\w-])((?:[a-z0-9-]+:)*)rounded-(xl|2xl|3xl)(?![\w-])/g)) used.add(m[0]);
    }
    expect([...used].sort()).toEqual(expect.arrayContaining(["rounded-2xl", "rounded-3xl", "sm:rounded-3xl"]));
    for (const cls of used) {
      const prefixes = cls.split(":").slice(0, -1);
      expect(prefixes.every((p) => p === "sm"), `${cls}: only the sm: variant has an override in site.css`).toBe(true);
      expect(css, `${cls} needs a rule in site.css`).toContain(`.site .${cls.replace(":", "\\:")}`);
    }
  });
});

describe("navbar", () => {
  const out = html(React.createElement(Navbar));

  it("is a floating pill at the spec's width", () => {
    expect(out).toContain("max-w-[760px]");
    expect(out).toContain("rounded-full");
    expect(out).toContain("border-neutral-200");
    expect(out).toContain("bg-white");
  });

  it("links Home, Product, AI assistant, Pricing and the accent Sign in", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Product", "AI assistant", "Pricing"]);
    expect(out).toContain('href="#product"');
    expect(out).toContain('href="#assistant"');
    expect(out).toContain('href="#pricing"');
    expect(out).toMatch(/href="\/login"/);
    expect(out).toMatch(/aria-current="page"/);
    // The accent link uses the contrast-safe ink colour derived from --site-accent.
    expect(out).toMatch(/<a[^>]*text-\(--site-accent-ink\)[^>]*href="\/login"/);
  });

  it("has a Start free button to sign-up and no meaningless cart icon", () => {
    expect(out).toMatch(/<a[^>]*href="\/signup">Start free/);
    expect(out.toLowerCase()).not.toContain("shopping-cart");
    expect(out.toLowerCase()).not.toContain("early access");
  });

  it("has a 44px hamburger that is wired to a hidden panel", () => {
    const button = out.match(/<button[^>]*>/)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain("md:hidden");
    expect(button).toContain("h-11");
    expect(button).toContain("w-11");
    const controls = button.match(/aria-controls="([^"]+)"/)![1];
    expect(out).toContain(`id="${controls}"`);
    expect(out).toMatch(new RegExp(`id="${controls.replace(/[:]/g, "\\:")}"[^>]*hidden`));
    // Spec: panel hangs under the pill with left-2 right-2 mt-2, rounded-2xl, p-3, z-20.
    for (const c of ["left-2", "right-2", "top-full", "mt-2", "rounded-2xl", "p-3", "z-20", "shadow-lg"]) {
      expect(out).toContain(c);
    }
  });

  it("implements close-on-link, Escape and a state toggle in the source", () => {
    const src = read("components/landing/hero/navbar.tsx");
    expect(src).toContain("useState");
    expect(src).toContain('"Escape"');
    expect(src).toContain("onClick={close}");
    expect(src).toContain("aria-controls");
  });
});

describe("gauge", () => {
  it("draws 40 ticks and lights round(value / 100 * 40) of them", () => {
    expect(GAUGE_TICKS).toBe(40);
    expect(activeTickCount(92)).toBe(37);
    expect(activeTickCount(68)).toBe(27);
    expect(activeTickCount(0)).toBe(0);
    expect(activeTickCount(100)).toBe(40);
    expect(activeTickCount(50)).toBe(20);

    for (const [value, lit] of [
      [92, 37],
      [68, 27],
    ] as const) {
      const svg = html(React.createElement(Gauge, { value }));
      expect(svg.match(/<line /g)).toHaveLength(40);
      expect(svg.match(/data-active="true"/g)).toHaveLength(lit);
      expect(svg.match(/data-active="false"/g)).toHaveLength(40 - lit);
    }
  });

  it("sweeps a 180 degree arc around (100, 100), ticks from radius 70 to 80", () => {
    const first = gaugeTick(0);
    const last = gaugeTick(GAUGE_TICKS - 1);
    expect(first).toMatchObject({ x1: 30, y1: 100, x2: 20, y2: 100 });
    expect(last).toMatchObject({ x1: 170, y1: 100, x2: 180, y2: 100 });
    const mid = gaugeTick(19);
    expect(mid.y2).toBeLessThan(25); // near the top of the arc
    for (let i = 0; i < GAUGE_TICKS; i++) {
      const t = gaugeTick(i);
      expect(Math.hypot(t.x2 - 100, t.y2 - 100)).toBeCloseTo(80, 1);
      expect(Math.hypot(t.x1 - 100, t.y1 - 100)).toBeCloseTo(70, 1);
      expect(t.y2).toBeLessThanOrEqual(100.01);
    }
  });

  it("matches the spec's svg: viewBox, stroke, centre text, optional labels", () => {
    const svg = html(React.createElement(Gauge, { value: 92, showLabels: true, min: "$38.9K", max: "$42.5K" }));
    expect(svg).toContain('viewBox="0 0 200 120"');
    expect(svg).toContain("max-w-[260px]");
    expect(svg).toContain('stroke-width="2.5"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain("#d4d4d8");
    expect(svg).toMatch(/<text[^>]*x="100"[^>]*y="105"[^>]*text-anchor="middle"[^>]*font-size="22"[^>]*font-weight="600"[^>]*>92%<\/text>/);
    expect(svg).toContain("var(--site-accent, #ef4d23)");
    expect(svg).toContain("$38.9K");
    expect(svg).toContain("$42.5K");
    const plain = html(React.createElement(Gauge, { value: 68, color: "#9ca3af" }));
    expect(plain).toContain("#9ca3af");
    expect(plain).not.toContain("text-[11px]");
  });
});

describe("dashboard preview", () => {
  const out = html(React.createElement(DashboardPreview));

  it("shows the three repair-shop cards from the brief", () => {
    for (const text of [
      "Takings",
      "This Month",
      "$6,896",
      "+$1,284 (23%)",
      "Compared to last month",
      "Compared to yesterday",
      "Month target achieved",
      "$0",
      "$7.5K",
      "Sales",
      "Repairs",
      "Show figures for",
      "This month",
      "Compare period by",
      "Month-to-date",
      "Sales target (this month)",
      "Sales target (this year)",
      "Save",
      "Cancel",
      "Ready for pickup",
      "today",
      "Ready",
      "Waiting",
      "Sample shop data",
    ]) {
      expect(out).toContain(text);
    }
    expect(out).toContain("92%");
    expect(out).toContain("68%");
    expect(out.match(/<line /g)).toHaveLength(80);
    expect(out).toContain("#9ca3af");
  });

  it("keeps the spec's tray measurements and responsive grid", () => {
    expect(out).toContain("max-w-[880px]");
    expect(out).toContain("rounded-3xl");
    expect(out).toContain("p-4");
    expect(out).toContain("sm:p-6");
    expect(out).toContain("grid-cols-1");
    expect(out).toContain("sm:grid-cols-2");
    expect(out).toContain("lg:grid-cols-3");
    expect(out).toContain("gap-3");
    expect(out).toContain("sm:gap-4");
    expect(out).toContain("px-3");
    expect(out).toContain("sm:px-4");
    expect(out).toContain("text-[28px]");
  });

  it("is one labelled image with nothing a keyboard can reach inside", () => {
    expect(out).toContain('role="img"');
    expect(out).toMatch(/aria-label="Preview of a repair shop dashboard with sample data/);
    expect(out).toContain("inert");
    expect(out).not.toMatch(/<(button|input|select|textarea|a)[\s>]/);
    expect(out).not.toContain("tabindex");
  });
});

describe("the brand orange lives on one line", () => {
  const css = read("components/landing/site.css");

  it("declares --site-accent exactly once and derives the darker variants from it", () => {
    expect(css.match(/--site-accent:\s*#ef4d23/g)).toHaveLength(1);
    expect(css).toMatch(/--site-accent-fill:\s*color-mix\(in srgb, var\(--site-accent\)/);
    expect(css).toMatch(/--site-accent-ink:\s*color-mix\(in srgb, var\(--site-accent\)/);
    expect(css).toContain("--site-ink: #0b0f1a");
    expect(css).toContain("--site-page: #ededed");
    expect(css).toContain("--site-hero: #d9d9d9");
    expect(css).toContain("--site-tray: #f5f2ee");
  });

  it("falls back to the poster when motion is reduced and progressively enhances with dvh", () => {
    expect(css).toContain(`--site-poster: url("${POSTER}")`);
    expect(css).toContain(`--site-poster: url("${POSTER_MOBILE}")`);
    expect(css).toMatch(/\.site-hero\s*\{\s*background:\s*var\(--site-hero\)\s*var\(--site-poster\)/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.site \.site-hero-video\s*\{\s*display:\s*none/);
    expect(css).toContain("100dvh - 24px");
    expect(css).toContain("100dvh - 32px");
  });
});

describe("fonts", () => {
  it("loads Inter 400-700 and Instrument Serif regular + italic through next/font/google", () => {
    const src = read("components/landing/fonts.ts");
    expect(src).toContain('from "next/font/google"');
    expect(src).toContain('weight: ["400", "500", "600", "700"]');
    expect(src).toContain('style: ["normal", "italic"]');
    expect(src).toContain("Instrument_Serif");
  });
});
