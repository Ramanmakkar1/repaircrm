import sharp from "sharp";
import type { AutomaticPhotoAttribution } from "./automatic-photo-types";
import { PRODUCT_PHOTO_MAX_BYTES, validateProductPhoto } from "./product-images";

const API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "RepairsHelper/1.0 (https://repairshelper.com; licensed product-photo fallback)";
const API_MAX_BYTES = 512 * 1024;
const DEADLINE_MS = 8_000;
export const AUTOMATIC_PHOTO_CHANGES = "Resized to fit 768 pixels and converted to WebP.";
const STOP_WORDS = new Set(["a", "an", "the", "for", "with", "and", "of", "new", "used", "refurbished", "replacement", "repair", "repairs", "service", "services", "black", "white", "blue", "red", "silver", "gold", "grey", "gray"]);
const GENERIC_HARDWARE = new Set(["webcam", "laptop", "keyboard", "mouse", "headphones", "microphone", "router", "printer", "monitor", "camera", "scanner", "projector"]);

/** Only a short catalogue name leaves the server; customer/job/description data never does. */
export function automaticPhotoQuery(name: string): string | null {
  // Reject obvious contact/URL/serial data rather than transmitting even a truncated value.
  const normalised = name.normalize("NFKC");
  if (/@|https?:|www\.|[\d\s()+-]{8,}\d/i.test(normalised) || normalised.length > 180) return null;
  const tokens = normalised.toLowerCase().match(/[\p{L}\p{N}]+(?:[-][\p{L}\p{N}]+)*/gu) ?? [];
  const meaningful = Array.from(new Set(tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token))));
  if (meaningful.some((token) => /^\d{7,}$/.test(token))) return null;
  const selected = meaningful.slice(0, 6);
  if (selected.length === 0 || (selected.length === 1 && !GENERIC_HARDWARE.has(selected[0]))) return null;
  const query = selected.join(" ").slice(0, 80).trim();
  return query.length >= 3 ? query : null;
}

function plainText(raw: unknown, max = 240): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " }[entity] ?? " "))
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_match, hex: string | undefined, decimal: string | undefined) => {
      const code = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function trustedUrl(raw: unknown, host: string, prefix: string): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === host && !url.port && !url.username && !url.password && url.pathname.startsWith(prefix) ? url.href : null;
  } catch { return null; }
}

/** Never accept an arbitrary URL returned by upstream metadata. */
export function commonsDownloadUrl(raw: unknown): string | null {
  return trustedUrl(raw, "upload.wikimedia.org", "/wikipedia/commons/")
    ?? trustedUrl(raw, "thumb.wikimedia.org", "/wikipedia/commons/thumb/");
}

export function commonsLicense(raw: unknown, rawUrl: unknown): { license: string; licenseUrl: string } | null {
  const label = plainText(raw, 80).toLowerCase().replace(/\s+/g, " ");
  // Commons metadata still supplies http/deed.en links. Canonicalise the
  // trusted licence host before matching; no request is made to this URL.
  let canonicalInput = rawUrl;
  if (typeof rawUrl === "string") {
    try { const parsed = new URL(rawUrl); if (parsed.protocol === "http:" && parsed.hostname === "creativecommons.org") { parsed.protocol = "https:"; canonicalInput = parsed.href; } } catch { return null; }
  }
  const url = trustedUrl(canonicalInput, "creativecommons.org", "/");
  if (!url) return null;
  const path = new URL(url).pathname.replace(/\/(?:deed(?:\.[a-z_-]+)?|legalcode(?:\.[a-z_-]+)?)\/?$/i, "/");
  if ((label === "cc0" || /^cc0 1\.0(?: universal)?$/.test(label)) && /^\/publicdomain\/zero\/1\.0\/?$/.test(path)) {
    return { license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
  }
  if (label === "public domain" && /^\/publicdomain\/mark\/1\.0\/?$/.test(path)) {
    return { license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/" };
  }
  const match = label.match(/^cc by(-sa)? ([1-4]\.0)$/);
  if (!match) return null;
  const family = match[1] ? "by-sa" : "by";
  if (!new RegExp(`^/licenses/${family}/${match[2].replace(".", "\\.")}/?$`).test(path)) return null;
  return { license: `CC BY${match[1] ? "-SA" : ""} ${match[2]}`, licenseUrl: `https://creativecommons.org/licenses/${family}/${match[2]}/` };
}

/** Exact catalogue/model tokens are required; loose search ranking cannot assign a different device. */
export function commonsRelevance(query: string, title: string): number {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const titleTokens = new Set(plainText(title).toLowerCase().replace(/^file:/, "").match(/[\p{L}\p{N}]+/gu) ?? []);
  if (/\b(logo|diagram|schematic|advertisement|poster|portrait|people|conference|building|screenshot|icon)\b/i.test(title)) return 0;
  const modelTokens = tokens.filter((token) => /\d/.test(token));
  if (modelTokens.some((token) => !titleTokens.has(token))) return 0;
  const matches = tokens.filter((token) => titleTokens.has(token)).length;
  if (matches < Math.min(2, tokens.length)) return 0;
  const ratio = matches / tokens.length;
  return ratio >= 0.8 ? ratio : 0;
}

type Metadata = Record<string, { value?: unknown } | undefined>;
type CommonsPage = { title?: unknown; imageinfo?: Array<{ url?: unknown; thumburl?: unknown; descriptionurl?: unknown; mime?: unknown; thumbmime?: unknown; width?: unknown; height?: unknown; extmetadata?: Metadata }> };
export type CommonsCandidate = { downloadUrl: string; mimeType: string; attribution: AutomaticPhotoAttribution; relevance: number };

export function commonsCandidates(data: unknown, query: string): CommonsCandidate[] {
  if (!data || typeof data !== "object") return [];
  const pages = (data as { query?: { pages?: CommonsPage[] | Record<string, CommonsPage> } }).query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const candidates: CommonsCandidate[] = [];
  for (const page of Object.values(pages).slice(0, 8)) {
    const info = page?.imageinfo?.[0];
    const title = plainText(page?.title).replace(/^File:/i, "");
    const relevance = commonsRelevance(query, title);
    if (!info || !relevance || !Number.isFinite(info.width) || !Number.isFinite(info.height) || Number(info.width) < 128 || Number(info.height) < 128) continue;
    // Do not rasterise an untrusted SVG/PDF; only source raster photographs qualify.
    if (!["image/jpeg", "image/png", "image/webp"].includes(String(info.mime))) continue;
    const metadata = info.extmetadata ?? {};
    const rights = commonsLicense(metadata.LicenseShortName?.value, metadata.LicenseUrl?.value);
    const sourceUrl = trustedUrl(info.descriptionurl, "commons.wikimedia.org", "/wiki/File:");
    const author = plainText(metadata.Artist?.value, 500);
    const restrictions = plainText(metadata.Restrictions?.value);
    const trustedThumbnail = commonsDownloadUrl(info.thumburl);
    const downloadUrl = trustedThumbnail ?? commonsDownloadUrl(info.url);
    const mimeType = String(trustedThumbnail ? info.thumbmime ?? info.mime : info.mime);
    if (!rights || !sourceUrl || !author || author.length >= 500 || restrictions || !downloadUrl || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) continue;
    candidates.push({ downloadUrl, mimeType, relevance, attribution: { title, author, sourceUrl, ...rights } });
  }
  return candidates.sort((a, b) => b.relevance - a.relevance);
}

async function limitedBytes(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) { await response.body?.cancel(); throw new Error("Photo response exceeded its size limit."); }
  if (!response.body) throw new Error("Photo response was empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Photo response exceeded its size limit.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const joined = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return joined;
}

function networkOptions(): RequestInit {
  return { headers: { "User-Agent": USER_AGENT, Accept: "application/json,image/jpeg,image/png,image/webp" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(DEADLINE_MS) };
}

export async function searchCommonsPhoto(query: string): Promise<{ file: File; attribution: AutomaticPhotoAttribution } | null> {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: "8", prop: "imageinfo", iiprop: "url|mime|size|extmetadata|thumbmime", iiurlwidth: "768", iiextmetadatalanguage: "en", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Restrictions", maxlag: "5" }).toString();
  const response = await fetch(url, networkOptions());
  if (!response.ok) throw new Error("Photo provider unavailable.");
  const data = JSON.parse(new TextDecoder().decode(await limitedBytes(response, API_MAX_BYTES))) as unknown;
  if (data && typeof data === "object" && "error" in data) throw new Error("Photo provider unavailable.");
  // At most two downloads after one search, even when a candidate is corrupt.
  for (const candidate of commonsCandidates(data, query).slice(0, 2)) {
    const image = await fetch(candidate.downloadUrl, networkOptions());
    if (!image.ok) continue;
    const type = image.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (type !== candidate.mimeType) { await image.body?.cancel(); continue; }
    const bytes = await limitedBytes(image, PRODUCT_PHOTO_MAX_BYTES);
    const extension = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    const file = new File([new Uint8Array(bytes)], `licensed-product-photo.${extension}`, { type });
    if (await validateProductPhoto(file)) continue;
    // Decode before caching: magic bytes alone do not establish that an image
    // is valid. Bound decompression and strip embedded metadata while making
    // touch-screen catalogues light enough to load quickly.
    try {
      const decoder = sharp(Buffer.from(bytes), { limitInputPixels: 16 * 1024 * 1024, failOn: "warning" });
      const metadata = await decoder.metadata();
      if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128 || (metadata.pages ?? 1) !== 1) continue;
      const optimised = await decoder.rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      if (optimised.byteLength > PRODUCT_PHOTO_MAX_BYTES) continue;
      return { file: new File([new Uint8Array(optimised)], "licensed-product-photo.webp", { type: "image/webp" }), attribution: { ...candidate.attribution, changes: AUTOMATIC_PHOTO_CHANGES } };
    } catch { /* A corrupt/oversized raster is not an eligible fallback. */ }
  }
  return null;
}
