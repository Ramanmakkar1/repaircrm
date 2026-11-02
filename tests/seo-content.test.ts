import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPARE_PAGES, OURS } from "@/components/marketing/content/compare";
import { FEATURE_PAGES } from "@/components/marketing/content/features";
import { GUIDES, sectionId } from "@/components/marketing/content/guides";
import { SOFTWARE_PAGES } from "@/components/marketing/content/software";
import { llmsTxt } from "@/lib/seo/llms";
import { PATH_DATES, PUBLIC_PATHS } from "@/lib/seo/pages";
import { articleSchema } from "@/lib/seo/schema";
import { absoluteUrl, formatLongDate } from "@/lib/seo/site";
import { INDEXNOW_KEY, sitemapUrls } from "../scripts/indexnow.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("comparison pages", () => {
  it("are in the sitemap paths with the date their sources were checked", () => {
    expect(PUBLIC_PATHS).toContain("/compare");
    for (const page of COMPARE_PAGES) {
      expect(PUBLIC_PATHS).toContain(`/compare/${page.slug}`);
      expect(page.checked).toMatch(ISO_DATE);
      expect(PATH_DATES[`/compare/${page.slug}`]).toBe(page.checked);
    }
  });

  it("cite a listed source on the competitor's own site for every row", () => {
    for (const page of COMPARE_PAGES) {
      // Their own site, help centre or API docs (e.g. orderry.readme.io), never a review site.
      const brand = page.competitor.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const source of Object.values(page.sources)) {
        expect(source.href.startsWith("https://")).toBe(true);
        expect(new URL(source.href).hostname, source.href).toContain(brand);
      }
      for (const row of page.rows) {
        expect(row.source.length).toBeGreaterThan(0);
        for (const key of row.source) expect(page.sources[key], `${page.slug}: ${row.topic} → ${key}`).toBeDefined();
      }
    }
  });

  it("describe Repairs helper with the shared product facts only", () => {
    const facts = new Set<string>(Object.values(OURS));
    for (const page of COMPARE_PAGES) for (const row of page.rows) expect(facts.has(row.ours)).toBe(true);
  });

  it("name the competitor in the title, heading and an affiliation answer", () => {
    for (const page of COMPARE_PAGES) {
      expect(page.metaTitle).toContain(page.competitor);
      expect(page.h1).toContain(page.competitor);
      expect(page.faqs.some((faq) => faq.q.includes("affiliated"))).toBe(true);
    }
  });
});

describe("guides", () => {
  it("carry real dates, an answer up front and unique section anchors", () => {
    for (const guide of GUIDES) {
      expect(guide.published).toMatch(ISO_DATE);
      expect(guide.updated).toMatch(ISO_DATE);
      expect(guide.updated >= guide.published).toBe(true);
      expect(PATH_DATES[`/guides/${guide.slug}`]).toBe(guide.updated);
      expect(guide.answer.length).toBeGreaterThan(150);
      expect(guide.answer.length).toBeLessThan(600);
      const ids = guide.sections.map((s) => sectionId(s.heading));
      expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("build an Article with the operator as author and the guide's own dates", () => {
    expect(
      articleSchema({ path: "/guides/x", headline: "H", description: "D", published: "2026-11-01", updated: "2026-11-02" }),
    ).toMatchObject({
      "@type": "Article",
      datePublished: "2026-11-01",
      dateModified: "2026-11-02",
      mainEntityOfPage: absoluteUrl("/guides/x"),
      author: { "@type": "Organization", name: "Town Media Labs" },
    });
    expect(formatLongDate("2026-11-01")).toBe("November 1, 2026");
  });
});

describe("all marketing content", () => {
  const pages = [...FEATURE_PAGES, ...SOFTWARE_PAGES, ...COMPARE_PAGES, ...GUIDES];

  it("has unique titles and descriptions that fit a search result", () => {
    const titles = pages.map((p) => p.metaTitle);
    const descriptions = pages.map((p) => p.metaDescription);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const page of pages) {
      expect(page.metaTitle).toContain("Repairs helper");
      expect(page.metaDescription.length, page.metaDescription).toBeGreaterThan(70);
      expect(page.metaDescription.length, page.metaDescription).toBeLessThanOrEqual(160);
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("targets a different search query on every page", () => {
    const queries = pages.map((p) => p.query.toLowerCase());
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("only links guides to feature pages that exist", () => {
    const slugs = new Set(FEATURE_PAGES.map((p) => p.slug));
    for (const guide of GUIDES) for (const slug of guide.related) expect(slugs.has(slug)).toBe(true);
  });
});

describe("llms.txt", () => {
  it("maps every content page with absolute links under one heading", () => {
    const text = llmsTxt();
    expect(text.startsWith("# Repairs helper\n\n> ")).toBe(true);
    for (const path of PUBLIC_PATHS.filter((p) => p !== "/" && p !== "/delete-account" && p !== "/features" && p !== "/compare" && p !== "/guides"))
      expect(text, path).toContain(`(${absoluteUrl(path)})`);
    expect(text).toContain("free during early access");
  });
});

describe("IndexNow", () => {
  it("serves the key file the submit script names", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
    expect(readFileSync(join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8").trim()).toBe(INDEXNOW_KEY);
  });

  it("reads every URL out of a sitemap", () => {
    const xml = "<urlset><url><loc>https://repairshelper.com/</loc></url><url><loc> https://repairshelper.com/guides </loc></url></urlset>";
    expect(sitemapUrls(xml)).toEqual(["https://repairshelper.com/", "https://repairshelper.com/guides"]);
  });
});
