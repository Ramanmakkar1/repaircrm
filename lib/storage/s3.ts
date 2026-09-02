import { signRequest } from "./sigv4";
import type { PutInput, StorageDriver, StoredObject } from "./types";

/**
 * S3-compatible object storage.
 *
 * Speaks the plain REST protocol with SigV4 (see ./sigv4.ts), so it works
 * against AWS S3, Cloudflare R2, MinIO, Backblaze B2 and anything else with the
 * same API — set `S3_ENDPOINT` and, for most non-AWS hosts, `S3_FORCE_PATH_STYLE`.
 *
 * FAILS CLOSED. If `STORAGE_DRIVER=s3` and any of the four required variables
 * is missing, `config()` throws with the name of the one that is missing. It
 * does NOT quietly fall back to local disk: a deploy that thinks it is writing
 * to a bucket and is actually writing to a container filesystem loses every
 * photo on the next restart, silently, and nobody notices for a month.
 *
 * STORED PATH: `s3://<bucket>/<key>`. The bucket is part of the record because
 * a shop that later moves buckets still has rows pointing at where their file
 * actually is — a bare key would be a guess.
 *
 * ENV
 *   S3_BUCKET            required
 *   S3_REGION            required (use "auto" for R2)
 *   S3_ACCESS_KEY_ID     required
 *   S3_SECRET_ACCESS_KEY required
 *   S3_ENDPOINT          optional — https://<account>.r2.cloudflarestorage.com,
 *                        http://127.0.0.1:9000 for MinIO. Omit for AWS.
 *   S3_FORCE_PATH_STYLE  optional — "true" puts the bucket in the path rather
 *                        than the hostname. Required by MinIO, and by any
 *                        endpoint without wildcard DNS.
 */

const TIMEOUT_MS = 30_000;
const SERVICE = "s3";

export type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
  pathStyle: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. STORAGE_DRIVER=s3 needs S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.`,
    );
  }
  return value;
}

export function s3Config(): S3Config {
  const endpoint = process.env.S3_ENDPOINT?.trim() || null;
  return {
    bucket: required("S3_BUCKET"),
    region: required("S3_REGION"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    endpoint,
    // Path style is the default whenever a custom endpoint is in play: almost
    // no self-hosted gateway has the wildcard DNS virtual-hosted style needs.
    pathStyle: flag(process.env.S3_FORCE_PATH_STYLE, endpoint !== null),
  };
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

/** True when every required variable is present — for the settings screen. */
export function s3Configured(): boolean {
  try {
    s3Config();
    return true;
  } catch {
    return false;
  }
}

/** Builds the object URL for either addressing style. */
export function objectUrl(config: S3Config, key: string): URL {
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  if (config.endpoint) {
    const base = config.endpoint.replace(/\/+$/, "");
    return new URL(
      config.pathStyle
        ? `${base}/${config.bucket}/${encoded}`
        : `${base}/${encoded}`,
    );
  }

  return new URL(
    config.pathStyle
      ? `https://s3.${config.region}.amazonaws.com/${config.bucket}/${encoded}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${encoded}`,
  );
}

/** `s3://bucket/key` -> its parts, or null when the string is not one of ours. */
export function parseStoredPath(
  storedPath: string,
): { bucket: string; key: string } | null {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(storedPath);
  if (!match) return null;
  return { bucket: match[1], key: match[2] };
}

async function send(
  config: S3Config,
  method: "PUT" | "GET" | "DELETE",
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const url = objectUrl(config, key);

  const headers = signRequest({
    method,
    url,
    region: config.region,
    service: SERVICE,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    // Content-Type is signed as well as sent, so a proxy cannot rewrite what
    // the object will later be served as.
    headers: contentType ? { "content-type": contentType } : {},
    payload: body,
  });

  return fetch(url, {
    method,
    headers,
    body: body as BodyInit | undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export const s3Driver: StorageDriver = {
  name: "s3",

  async put({ key, body, contentType }: PutInput): Promise<string> {
    const config = s3Config();
    const response = await send(config, "PUT", key, body, contentType);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `S3 PUT failed (${response.status}) ${detail.slice(0, 200)}`.trim(),
      );
    }

    return `s3://${config.bucket}/${key}`;
  },

  async get(storedPath: string): Promise<StoredObject | null> {
    const parsed = parseStoredPath(storedPath);
    if (!parsed) return null;

    const config = s3Config();
    const response = await send(config, "GET", parsed.key);

    // 404 and 403 both mean "you are not getting this object". Neither is worth
    // a 500 on a page that just wants to say "file is gone".
    if (!response.ok) return null;

    const body = Buffer.from(await response.arrayBuffer());
    return {
      body,
      contentType: response.headers.get("content-type"),
      sizeBytes: body.byteLength,
    };
  },

  async remove(storedPath: string): Promise<void> {
    const parsed = parseStoredPath(storedPath);
    if (!parsed) return;

    try {
      await send(s3Config(), "DELETE", parsed.key);
    } catch (error) {
      // Best-effort, exactly like the local driver: an orphaned object is a
      // housekeeping problem; a row that refuses to delete is a support ticket.
      console.error("[storage] S3 delete failed:", error);
    }
  },
};
