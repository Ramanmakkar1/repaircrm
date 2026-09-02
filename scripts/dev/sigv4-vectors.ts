/**
 * Checks lib/storage/sigv4.ts against AWS's own published example signatures.
 *
 *     npx tsx scripts/dev/sigv4-vectors.ts
 *
 * The fake bucket in ./fake-s3.mjs proves the driver and a second implementation
 * agree; these vectors prove that BOTH of them agree with Amazon. Without them,
 * two identical mistakes would look like a pass.
 *
 * The vectors are AWS's own published examples:
 *   1. the derived signing key from "Examples of the complete Signature
 *      Version 4 signing process" (iam / us-east-1 / 20150830)
 *   2. Amazon S3 API Reference, "Example: GET Object" — headers signed
 *   3. Amazon S3 API Reference, "Example: GET Bucket (List Objects)" — query
 *      parameters signed
 */
import { signRequest, signingKey } from "../../lib/storage/sigv4";

let failures = 0;

function check(label: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`      expected ${expected}`);
    console.log(`      actual   ${actual}`);
  }
}

function signatureOf(headers: Record<string, string>): string {
  return /Signature=([0-9a-f]+)/.exec(headers.Authorization)?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// 1. The derived signing key (IAM example, us-east-1)
// ---------------------------------------------------------------------------
check(
  "derived signing key (iam / us-east-1 / 20150830)",
  signingKey(
    "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    "20150830",
    "us-east-1",
    "iam",
  ).toString("hex"),
  "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
);

// ---------------------------------------------------------------------------
// 2. S3 "Example: GET Object" — a header-signed request
// ---------------------------------------------------------------------------
check(
  "S3 GET Object signature",
  signatureOf(
    signRequest({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      headers: { range: "bytes=0-9" },
      date: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
    }),
  ),
  "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
);

// ---------------------------------------------------------------------------
// 3. S3 "Example: GET Bucket (List Objects)" — a query-signed request
// ---------------------------------------------------------------------------
// The one that exercises canonical query encoding: parameters have to be
// percent-encoded and sorted by name before they are signed.
check(
  "S3 GET Bucket signature",
  signatureOf(
    signRequest({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"),
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      date: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
    }),
  ),
  "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
);

if (failures > 0) {
  console.error(`\n${failures} vector(s) failed.`);
  process.exit(1);
}
console.log("\nAll vectors matched.");
