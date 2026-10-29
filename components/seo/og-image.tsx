import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The share card for public pages: the husky, the wordmark, a small label
 * and the page's own headline, in the site palette (ink #111827, blue
 * #2563eb, tray #f4f6f8). Routes export `size`/`contentType` from here and
 * call `renderOgImage`; every route that uses it is prerendered at build, so
 * the file read below never runs on a request.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

let husky: Promise<string> | null = null;
function huskyDataUrl(): Promise<string> {
  husky ??= readFile(join(process.cwd(), "public/brand/husky-mark-blue.png")).then(
    (buf) => `data:image/png;base64,${buf.toString("base64")}`,
  );
  return husky;
}

export async function renderOgImage({ label, title }: { label: string; title: string }) {
  const mark = await huskyDataUrl();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          color: "#111827",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            width: 820,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
            <img src={mark} width={64} height={64} alt="" />
            <div style={{ display: "flex", fontSize: 34, letterSpacing: -1 }}>
              <span style={{ fontWeight: 500 }}>Repairs&nbsp;</span>
              <span style={{ fontWeight: 700, color: "#2563eb" }}>helper</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#1e40af" }}>{label}</div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: title.length > 48 ? 56 : 66,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: -2,
              }}
            >
              {title}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#4b5563" }}>
            repairshelper.com · Free during early access
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            background: "#eff4ff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
          <img src={mark} width={300} height={300} alt="" />
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
