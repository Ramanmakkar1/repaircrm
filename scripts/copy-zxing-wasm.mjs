// Copies the zxing-wasm reader binary into public/zxing so the scanner serves
// it from this app's own origin.
//
// zxing-wasm's default `locateFile` fetches the .wasm from the jsDelivr CDN. A
// repair shop's counter machine may be on a captive wifi or behind a firewall,
// and a barcode reader that needs the public internet to read a barcode is not
// a barcode reader. components/scan/decoder.ts overrides `locateFile` to point
// here; this script is what puts the file there.
//
// Runs on `postinstall`, so an upgrade of zxing-wasm can never leave a stale
// binary behind. The copy is committed too, for image builds that skip install.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "public/zxing/zxing_reader.wasm");

try {
  const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
} catch (error) {
  // A missing optional binary must not break `npm install` for someone who is
  // only running migrations; the scanner says so at runtime instead.
  console.warn(`[zxing] could not copy the reader wasm: ${error.message}`);
}
