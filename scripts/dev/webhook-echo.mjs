/**
 * Dev helper: a webhook receiver that VERIFIES the signature and prints it.
 *
 *     node scripts/dev/webhook-echo.mjs 4599 whsec_<secret>
 *
 * Answers 200 when the signature checks out, 401 when it does not, and 500 for
 * any path containing "fail" — which is how the retry/backoff path is exercised
 * without waiting for somebody's endpoint to actually break.
 */
import { createServer } from "node:http";
import crypto from "node:crypto";

const port = Number(process.argv[2] ?? 4599);
const secret = process.argv[3] ?? "";

function verify(rawBody, header, key) {
  if (!header) return false;
  const [t, v1] = header.split(",").map((part) => part.split("=")[1]);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return (
    v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))
  );
}

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const ok = verify(body, req.headers["x-repairpilot-signature"], secret);
    console.log(
      JSON.stringify({
        path: req.url,
        event: req.headers["x-repairpilot-event"],
        delivery: req.headers["x-repairpilot-delivery"],
        userAgent: req.headers["user-agent"],
        signatureValid: ok,
        body: JSON.parse(body || "{}"),
      }),
    );
    if (!ok) {
      res.writeHead(401).end("bad signature");
      return;
    }
    if (req.url.includes("fail")) {
      res.writeHead(500).end("deliberate failure");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  });
}).listen(port, () => console.log(`echo listening on ${port}`));
