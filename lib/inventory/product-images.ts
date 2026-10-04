import { bestCatalogMatch, bestDeviceEntry, catalogEntryByKey, hasPartWord, isServiceName } from "@/lib/catalog/match";
import type { CatalogEntry } from "@/lib/catalog/types";

/**
 * Which picture a product shows, best first: its own uploaded photo, the catalog picture someone chose
 * on purpose, the catalog picture matched from its name (the category counts for very little), and
 * otherwise nothing, so the app shows its normal placeholder rather than a wrong picture.
 * Pictures and the words that find them live in lib/catalog; this module only decides the order.
 * Category illustrations never imply an exact model.
 */
export type ProductImageInput = {
  productId?: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  /** Key of a catalog picture chosen on purpose (see lib/catalog). Unknown keys are ignored. */
  catalogImage?: string | null;
};

export const PRODUCT_IMAGE_SELECT = {
  where: { mimeType: { startsWith: "image/" } },
  orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
  select: { id: true },
};

export type ProductImageKind = "phone" | "tablet" | "television" | "console" | "drone" | "laptop" | "computer" | "watch" | "audio" | "camera" | "protector" | "case" | "charger" | "display" | "port" | "part" | "service" | "product";

type DeviceKind = "phone" | "tablet" | "television" | "console" | "drone" | "laptop" | "computer" | "watch" | "audio" | "camera";

const DEVICE_KIND: Record<string, DeviceKind> = {
  phone: "phone", tablet: "tablet", laptop: "laptop", "desktop-computer": "computer", television: "television", "game-console": "console",
  "handheld-console": "console", drone: "drone", smartwatch: "watch", headphones: "audio", earbuds: "audio", camera: "camera",
};
const KIND_BY_KEY: Record<string, ProductImageKind> = {};
const kindOfKeys = (kind: ProductImageKind, keys: string) => { for (const key of keys.split(" ")) KIND_BY_KEY[key] = kind; };
kindOfKeys("protector", "screen-protector privacy-screen-protector hydrogel-film");
kindOfKeys("case", "clear-case silicone-case wallet-case rugged-case magnetic-case tablet-case laptop-sleeve earbuds-case");
kindOfKeys("charger", "charger wall-charger car-charger wireless-charger laptop-charger universal-adapter");
kindOfKeys("display", "display-assembly tablet-screen laptop-lcd tv-panel touch-digitizer");
kindOfKeys("port", "charging-port");
kindOfKeys("part", [
  "usb-c-cable lightning-cable micro-usb-cable braided-cable aux-cable hdmi-cable ethernet-cable ac-power-cable",
  "laptop-keyboard laptop-battery laptop-fan dc-jack motherboard ram-module ssd-drive m2-ssd hard-drive cpu-processor graphics-card pc-power-supply thermal-paste",
  "analog-stick console-cooling-fan hdmi-port disc-drive tv-main-board tv-power-board tv-backlight-strips tv-tcon-board",
  "drone-battery drone-camera-gimbal drone-controller drone-motor drone-propellers",
  "phone-battery earpiece-speaker circuit-board camera-module back-glass loudspeaker mic-flex vibration-motor power-volume-flex home-button sim-tray back-housing front-camera tablet-battery",
].join(" "));

function kindOfEntry(entry: CatalogEntry): ProductImageKind {
  return DEVICE_KIND[entry.key] ?? KIND_BY_KEY[entry.key] ?? (entry.group === "Repair services" ? "service" : "product");
}

export function productImageKind(product: ProductImageInput): ProductImageKind {
  // "Screen repair" is work, whatever picture it gets.
  if (isServiceName(product)) return "service";
  const entry = catalogEntryByKey(product.catalogImage) ?? bestCatalogMatch(product);
  if (entry) return kindOfEntry(entry);
  // No picture, but a name with a part word is still a part: it gets the part placeholder, not a box.
  return hasPartWord(product.name) ? "part" : "product";
}

/** Family imagery describes the device type, never an exact make or model. */
export function deviceImageSource(text: string): { src: string; label: string; kind: DeviceKind } | null {
  const entry = bestDeviceEntry(text);
  const kind = entry ? DEVICE_KIND[entry.key] : undefined;
  return entry && kind ? { src: entry.image, label: entry.label, kind } : null;
}

export function productImageSource(product: ProductImageInput) {
  const kind = productImageKind(product);
  // Only the authenticated file endpoint is a valid persisted photo URL.
  if (product.imageUrl && /^\/files\/[A-Za-z0-9_-]+$/.test(product.imageUrl)) {
    return { src: product.imageUrl, alt: product.name, illustrative: false, kind, catalogKey: null as string | null };
  }
  const entry = catalogEntryByKey(product.catalogImage) ?? bestCatalogMatch(product);
  return {
    src: entry?.image ?? null,
    alt: entry ? `${entry.label} category illustration` : `No photo for ${product.name}`,
    illustrative: true,
    kind,
    catalogKey: (entry?.key ?? null) as string | null,
  };
}

export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/** MIME and signature must agree: a renamed HTML/SVG file cannot be served as a photo. */
export async function validateProductPhoto(file: File): Promise<string | null> {
  if (file.size === 0) return "That photo is empty. Choose another photo.";
  if (file.size > PRODUCT_PHOTO_MAX_BYTES) return "Choose a photo smaller than 5 MB.";
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const detected = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
  if (!detected || detected !== file.type.toLowerCase()) return "Choose a valid JPG, PNG, or WebP photo.";
  return null;
}
