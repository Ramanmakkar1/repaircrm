/**
 * A minimal S3-compatible object store for testing lib/storage/s3.ts.
 *
 *     node scripts/dev/fake-s3.mjs 9010 /tmp/fake-s3
 *
 * It is not a mock: it RE-DERIVES the AWS SigV4 signature from the request it
 * received, using its own independent implementation, and refuses anything that
 * does not match with a 403. That is the point — a mock that accepts whatever
 * we send proves nothing about whether real S3 would.
 *
 * Path-style only (`/<bucket>/<key>`), which is what S3_FORCE_PATH_STYLE=true
 * makes the driver use, and what MinIO and most self-hosted gateways want.
 *
 * Credentials are fixed:
 *     S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
 *     S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
 */
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2] ?? 9010);
const root = process.argv[3] ?? "/tmp/fake-s3";

const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

const encodeRfc3986 = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

function canonicalUri(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join("/");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

/** Rebuilds the signature the client should have produced. */
function expectedSignature(req, body, url) {
  const auth = req.headers.authorization ?? "";
  const credential = /Credential=([^,]+)/.exec(auth)?.[1];
  const signedHeaders = /SignedHeaders=([^,]+)/.exec(auth)?.[1];
  if (!credential || !signedHeaders) return null;

  const [, date, region, service] = credential.split("/");

  const canonicalHeaders = signedHeaders
    .split(";")
    .map((name) => `${name}:${String(req.headers[name] ?? "").trim().replace(/\s+/g, " ")}\n`)
    .join("");

  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const payloadHash = createHash("sha256").update(body).digest("hex");

  const canonicalRequest = [
    req.method,
    canonicalUri(url.pathname),
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    req.headers["x-amz-date"],
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  return {
    signature: hmac(signingKey(SECRET_KEY, date, region, service), stringToSign).toString("hex"),
    presented: /Signature=([0-9a-f]+)/.exec(auth)?.[1] ?? "",
    payloadHash,
    declaredHash: req.headers["x-amz-content-sha256"],
    accessKeyId: credential.split("/")[0],
  };
}

function filePathFor(pathname) {
  // /<bucket>/<shopId>/<name> -> <root>/<bucket>/<shopId>/<name>
  const clean = pathname.replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return null;
  return path.join(root, clean);
}

createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, `http://${req.headers.host}`);

    const check = expectedSignature(req, body, url);
    if (!check) {
      console.log(`403 ${req.method} ${url.pathname} — no Authorization`);
      res.writeHead(403).end("missing authorization");
      return;
    }
    if (check.accessKeyId !== ACCESS_KEY) {
      res.writeHead(403).end("unknown access key");
      return;
    }
    if (check.declaredHash !== check.payloadHash) {
      console.log(`403 ${req.method} ${url.pathname} — payload hash mismatch`);
      res.writeHead(403).end("payload hash mismatch");
      return;
    }
    const a = Buffer.from(check.presented, "utf8");
    const b = Buffer.from(check.signature, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      console.log(`403 ${req.method} ${url.pathname} — SignatureDoesNotMatch`);
      res.writeHead(403).end("SignatureDoesNotMatch");
      return;
    }

    const file = filePathFor(url.pathname);
    if (!file) {
      res.writeHead(400).end("bad key");
      return;
    }

    console.log(`${req.method} ${url.pathname} — signature OK`);

    try {
      if (req.method === "PUT") {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
        await writeFile(`${file}.type`, req.headers["content-type"] ?? "");
        res.writeHead(200).end();
      } else if (req.method === "GET") {
        const data = await readFile(file);
        const type = await readFile(`${file}.type`, "utf8").catch(
          () => "application/octet-stream",
        );
        res.writeHead(200, {
          "Content-Type": type || "application/octet-stream",
          "Content-Length": String(data.length),
        });
        res.end(data);
      } else if (req.method === "DELETE") {
        await rm(file, { force: true });
        await rm(`${file}.type`, { force: true });
        res.writeHead(204).end();
      } else {
        res.writeHead(405).end();
      }
    } catch {
      res.writeHead(404).end("NoSuchKey");
    }
  });
}).listen(port, () => console.log(`fake S3 on ${port}, storing under ${root}`));
