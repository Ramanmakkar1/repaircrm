import * as React from "react";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/landing/fonts", () => ({
  inter: { className: "font-inter", variable: "var-inter" },
  instrumentSerif: { className: "font-serif", variable: "var-serif" },
}));

const { SHOTS } = await import("@/components/landing/media");
const { SHOP_SCENES } = await import("@/components/landing/shop-story");
const { RepairsHome } = await import("@/components/landing/repairs-home");

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const onDisk = (src: string) => join(publicDir, src);

/** Every <img> source in the page, with next/image's /_next/image?url=... wrapper undone. */
function pageImageSources(markup: string): string[] {
  const out = new Set<string>();
  for (const m of markup.matchAll(/<img[^>]*?\ssrc="([^"]+)"/g)) {
    const src = m[1].replace(/&amp;/g, "&");
    const wrapped = src.match(/^\/_next\/image\?url=([^&]+)/);
    out.add(wrapped ? decodeURIComponent(wrapped[1]) : src);
  }
  return [...out];
}

describe("website images", () => {
  const page = renderToStaticMarkup(React.createElement(RepairsHome));
  const sources = pageImageSources(page);

  it("renders curated app screenshots, handover scenes and the panda mascot", () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
    for (const shot of [SHOTS.home, SHOTS.job, SHOTS.sell, SHOTS.stock, SHOTS.assistant]) expect(sources).toContain(shot.src);
    for (const scene of Object.values(SHOP_SCENES)) expect(sources).toContain(scene.src);
    expect(sources).toContain("/brand/panda-repair-mark.webp");
  });

  it("only points at files that exist in public/", () => {
    for (const src of sources) {
      expect(src.startsWith("/"), src).toBe(true);
      if (/^\/(marketing|images|brand)\//.test(src)) {
        expect(existsSync(onDisk(src)), `${src} is missing from public/`).toBe(true);
      }
    }
    expect(sources.some((s) => s.startsWith("/marketing/app/"))).toBe(true);
    expect(sources.some((s) => s.startsWith("/marketing/shop/"))).toBe(true);
  });

  it("never shows a screenshot of the old app", () => {
    expect(page).not.toContain("/marketing/figma/");
    expect(page).not.toContain("repair-bench");
    expect(page).not.toContain("desktop-dashboard");
  });

  it("gives every image an alt attribute, with real descriptions for the screenshots", () => {
    const imgs = page.match(/<img[^>]*>/g) ?? [];
    for (const img of imgs) expect(img).toMatch(/\salt="/);
    for (const shot of [SHOTS.home, SHOTS.job, SHOTS.sell, SHOTS.stock, SHOTS.assistant]) {
      expect(shot.alt.length).toBeGreaterThan(40);
      expect(page).toContain(shot.alt.replace(/'/g, "&#x27;"));
    }
  });

  it("gives every image explicit dimensions or a sized box", () => {
    for (const img of page.match(/<img[^>]*src="\/marketing\/app[^>]*>/g) ?? []) {
      expect(img).toMatch(/\swidth="\d+"/);
      expect(img).toMatch(/\sheight="\d+"/);
    }
  });
});

describe("app screenshots in public/marketing/app", () => {
  const dir = join(publicDir, "marketing/app");
  const files = readdirSync(dir).filter((f) => f.endsWith(".webp"));

  it("are WebP files of 220 KB or less", () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const f of files) {
      expect(statSync(join(dir, f)).size, f).toBeLessThanOrEqual(220 * 1024);
    }
  });

  it("are catalogued for reuse in product documentation", () => {
    const used = new Set(Object.values(SHOTS).map((s) => s.src.split("/").pop()));
    for (const f of files) expect(used.has(f), `${f} is not used`).toBe(true);
  });

  it("are captured at real device pixel size", async () => {
    const sharp = (await import("sharp")).default;
    for (const f of files) {
      if (f.startsWith("dashboard")) continue; // re-captured whenever the Shop overview changes
      const meta = await sharp(join(dir, f)).metadata();
      if (f.includes("-tablet")) expect([meta.width, meta.height], f).toEqual([2048, 1536]);
      if (f.includes("-phone")) expect([meta.width, meta.height], f).toEqual([1170, 2532]);
      expect(meta.format).toBe("webp");
    }
  });
});
