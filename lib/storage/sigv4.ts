import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4, in about a hundred lines of `node:crypto`.
 *
 * WHY NOT THE SDK: `@aws-sdk/client-s3` is ~15MB of dependency tree to make
 * three HTTP requests (PUT, GET, DELETE) whose signing algorithm is a published
 * spec and does not change. This file has no dependencies, works unmodified
 * against S3, Cloudflare R2, MinIO, Backblaze B2 and anything else that speaks
 * the same protocol, and can be read end to end by whoever has to debug a
 * `SignatureDoesNotMatch` at 2am.
 *
 * THE ALGORITHM, in the order the code does it:
 *
 *   1. CANONICAL REQUEST
 *        METHOD \n URI \n QUERY \n HEADERS \n\n SIGNED_HEADERS \n PAYLOAD_HASH
 *      Every part is normalised so client and server derive the same bytes:
 *      path segments percent-encoded, query keys sorted, header names
 *      lowercased and sorted, header values whitespace-collapsed.
 *   2. STRING TO SIGN
 *        AWS4-HMAC-SHA256 \n <ISO basic date> \n <scope> \n sha256(canonical)
 *   3. SIGNING KEY — HMAC chain over date, region, service, "aws4_request",
 *      seeded with "AWS4" + the secret. Derived per day and per service, which
 *      is what keeps a leaked signature from being useful anywhere else.
 *   4. SIGNATURE = HMAC(signingKey, stringToSign), hex.
 *
 * Verified against the published AWS test vectors — see
 * scripts/dev/sigv4-vectors.mjs.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

/** sha256 of the empty string — the payload hash for a GET or a DELETE. */
export const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type SignInput = {
  method: string;
  /** Full request URL, already built (path style or virtual-hosted). */
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Extra headers to sign. `host` and the x-amz-* trio are added here. */
  headers?: Record<string, string>;
  /** Request body. Omitted means an empty payload. */
  payload?: Buffer;
  /** Overridable so a test can reproduce a published vector exactly. */
  date?: Date;
};

/** The headers to send, including `Authorization`. */
export function signRequest(input: SignInput): Record<string, string> {
  const date = input.date ?? new Date();
  const amzDate = toAmzDate(date);
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = input.payload
    ? sha256Hex(input.payload)
    : EMPTY_PAYLOAD_SHA256;

  // Host is signed on every request: it is what binds a signature to one
  // bucket/endpoint, so a captured signature cannot be replayed elsewhere.
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const normalised = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), collapse(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalHeaders = normalised.map(([n, v]) => `${n}:${v}\n`).join("");
  const signedHeaders = normalised.map(([n]) => n).join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(input.url.pathname),
    canonicalQuery(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");

  const signature = hmac(
    signingKey(input.secretAccessKey, dateStamp, input.region, input.service),
    stringToSign,
  ).toString("hex");

  return {
    ...headers,
    Authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/**
 * Percent-encodes a path, keeping `/` as a separator.
 *
 * `encodeURIComponent` leaves `!'()*` alone; SigV4 requires them encoded, so
 * they are patched afterwards. Getting this wrong is the single commonest cause
 * of a signature that works for `photo.jpg` and fails for `photo (1).jpg`.
 *
 * S3 does NOT double-encode the path (unlike every other AWS service), which is
 * why the already-encoded pathname is passed straight through: `new URL()` has
 * encoded it once, and once is what S3 wants.
 */
function canonicalUri(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join("/");
}

function canonicalQuery(params: URLSearchParams): string {
  const pairs: [string, string][] = [];
  params.forEach((value, key) => pairs.push([key, value]));
  return pairs
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? cmp(av, bv) : cmp(ak, bk)))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Header values are trimmed and their internal runs of space collapsed to one. */
function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** `20130524T000000Z` — ISO 8601 basic, which is what x-amz-date must be. */
export function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
