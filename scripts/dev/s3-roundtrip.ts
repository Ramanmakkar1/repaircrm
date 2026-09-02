/**
 * Exercises lib/storage/s3.ts against the fake bucket in ./fake-s3.mjs.
 *
 *     node scripts/dev/fake-s3.mjs 9010 /tmp/fake-s3 &
 *     npx tsx scripts/dev/s3-roundtrip.ts
 *
 * PUT, GET, DELETE, then GET again expecting a miss. The fake re-derives every
 * signature with its own implementation and answers 403 when it disagrees, so a
 * green run means the signing is right, not just self-consistent.
 */
import { s3Driver } from "../../lib/storage/s3";

process.env.S3_BUCKET = "repairflow-test";
process.env.S3_REGION = "us-east-1";
process.env.S3_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
process.env.S3_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9010";
process.env.S3_FORCE_PATH_STYLE = "true";

function check(label: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  // A key with a space and parentheses in it: the characters that break a
  // naive percent-encoder and produce SignatureDoesNotMatch in production only.
  const key = `shop_test/photo (1) of screen.png`;
  const body = Buffer.from("not really a png, but it is bytes\n".repeat(64));

  const stored = await s3Driver.put({ key, body, contentType: "image/png" });
  check("put returns an s3:// path", stored === "s3://repairflow-test/" + key);

  const read = await s3Driver.get(stored);
  check("get returns the object", read !== null);
  check("bytes round-trip intact", read?.body.equals(body) === true);
  check("content type survives", read?.contentType === "image/png");
  check("size is reported", read?.sizeBytes === body.byteLength);

  await s3Driver.remove(stored);
  const gone = await s3Driver.get(stored);
  check("delete removes the object", gone === null);

  const missing = await s3Driver.get("s3://repairflow-test/shop_test/nope.png");
  check("a missing key is null, not a throw", missing === null);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
