// Renders test barcodes as PNGs, for proving the scanner actually decodes.
//
//   npm i --no-save canvas
//   node scripts/dev/make-test-barcodes.mjs [outDir]
//
// `canvas` is deliberately NOT a dependency: it is a native module that would
// cost every install a compile, for a script only ever run by hand while
// working on the scanner. Install it for the minute you need it.
//
// Writes one PNG per symbology the scanner claims to support, using the same
// jsbarcode the app prints its own labels with (components/billing/barcode.tsx)
// — so "does the reader read our labels?" is answered by the very same encoder
// that draws them. The QR is drawn with `qrcode`, which is what the phone
// pairing dialog uses.
//
// Feed the results to a browser: `createImageBitmap` onto a canvas and run the
// engine over it, or convert one to Y4M and hand it to Chrome as a fake camera
// (--use-file-for-fake-video-capture). Nothing here ships to production.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createCanvas } from "canvas";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/** value + format pairs covering everything components/scan/decoder.ts asks for. */
const CASES = [
  { name: "upca", format: "UPC", value: "810001100773" },
  { name: "ean13", format: "EAN13", value: "0810001100773" },
  { name: "ean8", format: "EAN8", value: "96385074" },
  { name: "code128-sku", format: "CODE128", value: "REF-IP13" },
  { name: "code128-ticket", format: "CODE128", value: "T1001" },
  { name: "code128-invoice", format: "CODE128", value: "I1001" },
  { name: "code128-po", format: "CODE128", value: "PO1" },
  { name: "code128-serial", format: "CODE128", value: "SN-IP13-0001" },
  { name: "code39", format: "CODE39", value: "SCR-IP14" },
  { name: "itf", format: "ITF", value: "12345678" },
];

const outDir = resolve(process.argv[2] ?? "scripts/dev/barcodes");
await mkdir(outDir, { recursive: true });

for (const testCase of CASES) {
  const canvas = createCanvas(600, 260);
  JsBarcode(canvas, testCase.value, {
    format: testCase.format,
    // Wide bars and a generous quiet zone: this is a test fixture, not a label,
    // and a decode failure should mean the decoder is wrong rather than that
    // the image was too small to read.
    width: 3,
    height: 140,
    margin: 30,
    displayValue: true,
    fontSize: 20,
    background: "#ffffff",
    lineColor: "#000000",
  });
  await writeFile(
    resolve(outDir, `${testCase.name}.png`),
    canvas.toBuffer("image/png"),
  );
  console.log(`${testCase.name}.png  ${testCase.format}  ${testCase.value}`);
}

await QRCode.toFile(resolve(outDir, "qr.png"), "https://example.test/scan/ABC234", {
  width: 400,
  margin: 2,
});
console.log("qr.png  QR  https://example.test/scan/ABC234");
console.log(`\nWrote ${CASES.length + 1} images to ${outDir}`);
