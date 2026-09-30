import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { automaticPhotoQuery, commonsCandidates, commonsDownloadUrl, commonsLicense, commonsRelevance, searchCommonsPhoto } from "@/lib/inventory/commons-photos";

let png: Uint8Array<ArrayBuffer>;
beforeAll(async () => { png = new Uint8Array(await sharp({ create: { width: 256, height: 256, channels: 3, background: "white" } }).png().toBuffer()); });
function page(overrides: Record<string, unknown> = {}) {
  return { title: "File:Lenovo ThinkPad T420.png", imageinfo: [{
    url: "https://upload.wikimedia.org/wikipedia/commons/1/12/ThinkPad_T420.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Lenovo_ThinkPad_T420.png",
    mime: "image/png", width: 1024, height: 768,
    extmetadata: { Artist: { value: '<a href="https://example.com">Photo Creator</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "http://creativecommons.org/licenses/by-sa/4.0/deed.en" } }, ...overrides,
  }] };
}
afterEach(() => vi.unstubAllGlobals());

describe("licensed Commons photo eligibility", () => {
  it("bounds catalogue queries and rejects contact data instead of transmitting it", () => {
    expect(automaticPhotoQuery("New Lenovo ThinkPad T420 for repair")).toBe("lenovo thinkpad t420");
    expect(automaticPhotoQuery("webcam")).toBe("webcam");
    expect(automaticPhotoQuery("John")).toBeNull();
    expect(automaticPhotoQuery("Computer john@example.com")).toBeNull();
    expect(automaticPhotoQuery("Computer john＠example.com")).toBeNull();
    expect(automaticPhotoQuery("Laptop 780-555-1234")).toBeNull();
    expect(automaticPhotoQuery("Laptop https://example.com")).toBeNull();
    expect(automaticPhotoQuery("x".repeat(181))).toBeNull();
  });

  it("accepts only explicit commercial-use licences with their matching canonical link", () => {
    expect(commonsLicense("CC BY-SA 4.0", "http://creativecommons.org/licenses/by-sa/4.0/deed.en")).toEqual({ license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" });
    expect(commonsLicense("CC0", "http://creativecommons.org/publicdomain/zero/1.0/deed.en")?.license).toBe("CC0 1.0");
    expect(commonsLicense("Public domain", "https://creativecommons.org/publicdomain/mark/1.0/")?.license).toBe("Public domain");
    expect(commonsLicense("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/")).toBeNull();
    expect(commonsLicense("CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/")).toBeNull();
    expect(commonsLicense("CC BY 4.0", "https://creativecommons.org/licenses/by-sa/4.0/")).toBeNull();
    expect(commonsLicense("CC BY 4.0", "https://evil.example/licenses/by/4.0/")).toBeNull();
    expect(commonsLicense("Public domain", undefined)).toBeNull();
  });

  it("requires the same model and rejects logos, screenshots, or weak search matches", () => {
    expect(commonsRelevance("thinkpad t420", "File:Lenovo ThinkPad T420.jpg")).toBe(1);
    expect(commonsRelevance("thinkpad t420", "File:Lenovo ThinkPad T430.jpg")).toBe(0);
    expect(commonsRelevance("logitech c920 webcam", "File:Webcam.jpg")).toBe(0);
    expect(commonsRelevance("thinkpad t420", "File:ThinkPad T420 screenshot.jpg")).toBe(0);
    expect(commonsRelevance("webcam", "File:USB webcam.jpg")).toBe(1);
  });

  it("permits only the two fixed Wikimedia file hosts and their Commons namespaces", () => {
    expect(commonsDownloadUrl("http://upload.wikimedia.org/wikipedia/commons/a/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://user:secret@upload.wikimedia.org/wikipedia/commons/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://127.0.0.1/wikipedia/commons/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://upload.wikimedia.org/wikipedia/en/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://thumb.wikimedia.org.evil.example/wikipedia/commons/thumb/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://random.wikimedia.org/wikipedia/commons/thumb/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://thumb.wikimedia.org/wikipedia/en/thumb/a.jpg")).toBeNull();
    expect(commonsDownloadUrl("https://thumb.wikimedia.org:444/wikipedia/commons/thumb/a.jpg")).toBeNull();
    const candidates = commonsCandidates({ query: { pages: [page({ thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/example.png" })] } }, "thinkpad t420");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].downloadUrl).toBe("https://thumb.wikimedia.org/wikipedia/commons/thumb/example.png");
    expect(candidates[0].attribution.author).toBe("Photo Creator");
    const untrustedThumbnail = commonsCandidates({ query: { pages: [page({ thumburl: "https://evil.example/wikipedia/commons/thumb/example.png" })] } }, "thinkpad t420");
    expect(untrustedThumbnail[0].downloadUrl).toBe("https://upload.wikimedia.org/wikipedia/commons/1/12/ThinkPad_T420.png");
  });

  it("rejects missing credit, restricted content, non-raster sources, and hostile source links", () => {
    for (const overrides of [
      { mime: "image/svg+xml" }, { descriptionurl: "https://evil.example/File:ThinkPad.png" },
      { extmetadata: { LicenseShortName: { value: "CC BY 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" } } },
      { extmetadata: { Artist: { value: "Creator" }, LicenseShortName: { value: "CC BY 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }, Restrictions: { value: "Personality rights" } } },
    ]) expect(commonsCandidates({ query: { pages: [page(overrides)] } }, "thinkpad t420")).toHaveLength(0);
  });
});

describe("bounded Commons downloads", () => {
  it("downloads a licensed raster once from a trusted host with redirect rejection and a deadline", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ query: { pages: [page()] } })).mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    const found = await searchCommonsPhoto("thinkpad t420");
    expect(found?.file.type).toBe("image/webp");
    expect(found?.file.size).toBeLessThan(png.length);
    expect(found?.attribution.license).toBe("CC BY-SA 4.0");
    expect(found?.attribution.changes).toBe("Resized to fit 768 pixels and converted to WebP.");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [api, options] = fetcher.mock.calls[0];
    expect(new URL(String(api)).hostname).toBe("commons.wikimedia.org");
    expect(new URL(String(api)).searchParams.get("gsrnamespace")).toBe("6");
    expect(new URL(String(api)).searchParams.get("gsrsearch")).toBe("thinkpad t420");
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not store a renamed HTML image or mismatched MIME response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ query: { pages: [page()] } })).mockResolvedValueOnce(new Response("<html>not an image</html>", { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await searchCommonsPhoto("thinkpad t420")).toBeNull();
  });

  it("aborts declared and streaming oversized responses before accepting any bytes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ query: { pages: [page()] } })).mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchCommonsPhoto("thinkpad t420")).rejects.toThrow("size limit");
    fetcher.mockReset().mockResolvedValueOnce(Response.json({ query: { pages: [page()] } })).mockResolvedValueOnce(new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { "content-type": "image/png" } }));
    await expect(searchCommonsPhoto("thinkpad t420")).rejects.toThrow("size limit");
  });

  it("returns no match without downloading an irrelevant model", async () => {
    const item = page(); item.title = "File:ThinkPad T430.png";
    const fetcher = vi.fn().mockResolvedValue(Response.json({ query: { pages: [item] } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await searchCommonsPhoto("thinkpad t420")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
