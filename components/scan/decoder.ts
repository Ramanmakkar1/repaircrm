import {
  nativeBarcodeDetector,
  type NativeBarcodeDetector,
  type NativeBarcodeFormat,
} from "./support";

/**
 * The thing that turns pixels into a string.
 *
 * ---------------------------------------------------------------------------
 * TWO ENGINES, ONE INTERFACE
 * ---------------------------------------------------------------------------
 *   native  `BarcodeDetector`, built into Chrome on Android and Chrome/Edge on
 *           desktop. Free, fast, and hardware-accelerated where the platform
 *           has a decoder (Android's is the Play Services one).
 *   zxing   `zxing-wasm`, a WebAssembly build of ZXing-C++. About 1.1 MB of
 *           .wasm, loaded ONLY when someone opens the scanner and only when
 *           the native detector is missing — which in practice means Safari,
 *           and therefore every browser on an iPhone.
 *
 * Both are asked the same question — "what barcodes are in this canvas?" — and
 * both answer with the same shape, so the dialog above never branches on which
 * one it got beyond naming it in a debug line.
 *
 * The WASM binary is served from this app's own /zxing/ rather than from the
 * jsDelivr CDN the library defaults to: a repair shop's counter machine may be
 * on a captive wifi or behind a firewall, and a scanner that needs the public
 * internet to read a barcode is not a scanner.
 */

/** One decoded symbol. */
export type ScanHit = {
  value: string;
  /** Human symbology name, e.g. "EAN-13" — shown in the dialog's hit chip. */
  format: string;
};

export interface BarcodeEngine {
  /** Which implementation this is; surfaced in the dialog's fine print. */
  readonly name: "native" | "zxing";
  /** Every barcode currently visible in the canvas. */
  scan(canvas: HTMLCanvasElement): Promise<ScanHit[]>;
}

/**
 * The symbologies a repair shop actually meets: retail codes on boxed
 * accessories, Code 128 on this app's own labels and most distributor
 * packaging, Code 39 and ITF on older stock, and QR for the pairing handshake.
 */
const NATIVE_FORMATS: NativeBarcodeFormat[] = [
  "upc_a",
  "upc_e",
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

/** The same list in ZXing's spelling. */
const ZXING_FORMATS = [
  "UPCA",
  "UPCE",
  "EAN13",
  "EAN8",
  "Code128",
  "Code39",
  "ITF",
  "QRCode",
] as const;

/** ZXing / BarcodeDetector spellings -> what a person would call it. */
const FORMAT_LABELS: Record<string, string> = {
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  code_128: "Code 128",
  code_39: "Code 39",
  itf: "ITF",
  qr_code: "QR",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  EAN13: "EAN-13",
  EAN8: "EAN-8",
  Code128: "Code 128",
  Code39: "Code 39",
  ITF: "ITF",
  QRCode: "QR",
};

function labelFormat(raw: string): string {
  return FORMAT_LABELS[raw] ?? raw;
}

/**
 * Builds the best engine this browser can offer.
 *
 * The native detector is preferred when it exists AND covers the linear
 * symbologies — a browser that only ships `qr_code` would quietly stop reading
 * product barcodes, so that case falls through to WASM rather than pretending.
 */
export async function createEngine(): Promise<BarcodeEngine> {
  const Detector = nativeBarcodeDetector();
  if (Detector) {
    try {
      const supported = await Detector.getSupportedFormats();
      const usable = NATIVE_FORMATS.filter((format) => supported.includes(format));
      if (usable.includes("ean_13") && usable.includes("code_128")) {
        return nativeEngine(new Detector({ formats: usable }));
      }
    } catch {
      // A detector that will not even list its formats is not one to trust.
    }
  }
  return zxingEngine();
}

function nativeEngine(detector: NativeBarcodeDetector): BarcodeEngine {
  return {
    name: "native",
    async scan(canvas) {
      const found = await detector.detect(canvas);
      return found
        .filter((row) => typeof row.rawValue === "string" && row.rawValue.length > 0)
        .map((row) => ({ value: row.rawValue, format: labelFormat(row.format) }));
    },
  };
}

/**
 * The WASM engine.
 *
 * `import("zxing-wasm/reader")` is deliberately inside this function: it is the
 * one thing in the feature that costs a megabyte, and it must not be paid for
 * on the POS screen's first paint — only when a scanner dialog actually opens
 * on a browser that has no native detector.
 */
async function zxingEngine(): Promise<BarcodeEngine> {
  const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");

  // Serve the binary from this origin. The library's default `locateFile`
  // points at jsDelivr, which a shop behind a firewall cannot reach.
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/zxing/${path}` : `${prefix}${path}`,
    },
  });

  return {
    name: "zxing",
    async scan(canvas) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || canvas.width === 0 || canvas.height === 0) return [];
      const image = context.getImageData(0, 0, canvas.width, canvas.height);

      const results = await readBarcodes(image, {
        formats: [...ZXING_FORMATS],
        // A live camera frame is never "pure" — there is a counter, a hand and
        // a box in it — so the extra passes are what make a handheld read work.
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
      });

      return results
        .filter((row) => row.isValid && row.text.length > 0)
        .map((row) => ({ value: row.text, format: labelFormat(row.format) }));
    },
  };
}
