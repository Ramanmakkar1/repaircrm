import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const binding = config.hyperdrive?.find((entry) => entry.binding === "HYPERDRIVE");

if (!binding?.id || binding.id === "00000000-0000-0000-0000-000000000000") {
  console.error(
    "Cloudflare deployment is not configured: create a production Hyperdrive configuration and set its ID in wrangler.jsonc.",
  );
  process.exit(1);
}
