/**
 * Attachment rules shared by the browser and the server.
 *
 * Pure functions only — no `node:fs`, no Prisma — because both the upload UI
 * and the route handler that writes to disk import from here. One copy of the
 * size cap and one copy of the type whitelist, so a friendly client-side
 * rejection and the real server-side rejection can never disagree about what
 * is allowed. (Same reasoning as ticket-meta.ts.)
 *
 * The client checks are a courtesy that saves a 10MB round-trip. The server
 * re-runs every one of them; nothing here is a security boundary on its own.
 */

/** 10 MB. Big enough for a phone photo of a cracked screen, small enough to post. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Hint for the file picker. Not enforcement — the picker can be bypassed. */
export const UPLOAD_ACCEPT = "image/*,application/pdf,text/plain,.txt,.log,.md,.csv,.json,.zip";

// ---------------------------------------------------------------------------
// Type whitelist
// ---------------------------------------------------------------------------

const ALLOWED_PREFIXES = ["image/", "text/"] as const;

const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/zip",
  // Windows Chrome labels a .zip this way. Same bytes, different string.
  "application/x-zip-compressed",
  "application/json",
]);

/**
 * Types that pass the prefix test but must never be stored.
 *
 * Uploads are served from /uploads on RepairPilot's OWN origin, so an SVG or an
 * HTML file is not an attachment — it is a script the shop hosts for us, with
 * access to the session cookie of whoever clicks it. `image/` and `text/` are
 * otherwise fine; these specific members of those families are stored XSS.
 */
const DENIED_EXACT = new Set([
  "image/svg+xml",
  "text/html",
  "text/xml",
  "application/xhtml+xml",
  "image/svg",
]);

/**
 * Browsers send an empty `type` for extensions they don't recognise — .log is
 * the everyday example, and a tech attaching a log file is exactly the case
 * this feature exists for. So an unlabelled file is judged by its extension.
 */
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  log: "text/plain",
  md: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
};

/** Extensions we are willing to put on disk, and therefore to serve back. */
const ALLOWED_EXT = new Set(Object.keys(MIME_BY_EXT).concat(["jpeg", "tiff", "tif"]));

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** Lowercased extension with no dot, or "" when the name has none. */
export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Resolves the type to trust for a file, or null when it isn't allowed.
 * An empty/unknown browser type falls back to the extension.
 */
export function resolveMimeType(
  browserType: string,
  fileName: string,
): string | null {
  const declared = browserType.trim().toLowerCase().split(";")[0];
  const fromExt = MIME_BY_EXT[extensionOf(fileName)] ?? "";
  const mime = declared && declared !== "application/octet-stream" ? declared : fromExt;

  if (!mime) return null;
  if (DENIED_EXACT.has(mime)) return null;
  if (ALLOWED_EXACT.has(mime)) return mime;
  if (ALLOWED_PREFIXES.some((prefix) => mime.startsWith(prefix))) return mime;
  return null;
}

/**
 * The extension to use ON DISK.
 *
 * Whitelisted, never taken on trust: the extension is what decides the
 * Content-Type the file is later served with, so an attacker-chosen one is an
 * attacker-chosen response header. Anything unrecognised becomes ".bin", which
 * downloads instead of rendering.
 */
export function safeExtension(fileName: string, mimeType: string): string {
  const fromName = extensionOf(fileName);
  if (fromName && ALLOWED_EXT.has(fromName)) return fromName;
  return EXT_BY_MIME[mimeType] ?? "bin";
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export type FileKind = "image" | "pdf" | "text" | "archive" | "other";

export function fileKind(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";
  if (mimeType.includes("zip")) return "archive";
  return "other";
}

/** 1536 -> "1.5 KB". One decimal above KB, none below — nobody reads "1.0 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The single source of the rejection sentences, so the toast a user sees for a
 * too-big file is the same whether the browser caught it or the server did.
 */
export function rejectionReason(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  }
  if (!resolveMimeType(file.type, file.name)) {
    return `${file.name} isn't a supported file type. Images, PDFs, text or log files and zips only.`;
  }
  return null;
}
