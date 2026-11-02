#!/usr/bin/env node
/**
 * Tell the IndexNow search engines (Bing, Yandex, Seznam, Naver and others)
 * that the public pages changed, so new and updated pages are crawled within
 * hours instead of on the next routine visit. Bing's index also feeds Copilot
 * and ChatGPT search. Run it after a release that adds or changes pages:
 *
 *   npm run seo:indexnow              submit every URL in the live sitemap
 *   npm run seo:indexnow -- --dry-run show what would be sent
 *
 * The key is public by design: the engines fetch /<key>.txt (in public/) to
 * check the request came from the site itself. Google does not use IndexNow;
 * it reads the sitemap submitted in Search Console.
 */
import { pathToFileURL } from "node:url";

const ORIGIN = "https://repairshelper.com";
export const INDEXNOW_KEY = "563c7d042cc78e68c5a5d8fde64ffad6";

/** Every <loc> in a sitemap document. */
export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sitemap = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!sitemap.ok) throw new Error(`sitemap.xml returned ${sitemap.status}`);
  const urlList = sitemapUrls(await sitemap.text()).filter((url) => url.startsWith(`${ORIGIN}/`));
  if (urlList.length === 0) throw new Error("No URLs found in sitemap.xml");

  const body = { host: new URL(ORIGIN).host, key: INDEXNOW_KEY, keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`, urlList };
  if (dryRun) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200 = accepted; 202 = accepted, key check still pending.
  console.log(`IndexNow answered ${res.status} for ${urlList.length} URLs`);
  if (res.status >= 400) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
