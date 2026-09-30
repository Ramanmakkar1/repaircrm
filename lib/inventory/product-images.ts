/** Product photos take priority; category illustrations never imply an exact model. */
export type ProductImageInput = {
  productId?: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
};

export const PRODUCT_IMAGE_SELECT = {
  where: { mimeType: { startsWith: "image/" } },
  orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  take: 1,
  select: { id: true },
};

export type ProductImageKind = "phone" | "tablet" | "television" | "console" | "drone" | "protector" | "case" | "charger" | "display" | "port" | "part" | "service" | "product";

export function productImageKind({ name, category }: ProductImageInput): ProductImageKind {
  const text = `${category ?? ""} ${name}`.toLowerCase();
  if (/\b(services?|labou?r|diagnostics?|installation|cleaning|unlock)\b/.test(text) || /\brepairs?$/.test(name.toLowerCase()) || /^repairs?$/.test(category?.trim().toLowerCase() ?? "")) return "service";
  if (/\b(screen\s*(guard|protector|protection)|tempered\s*glass)\b/.test(text)) return "protector";
  if (/\b(case|cover|bumper)\b/.test(text)) return "case";
  if (/\b(charger|charging adapter|power adapter|wall adapter)\b/.test(text)) return "charger";
  if (/\b(charging ports?|charge ports?|usb[-\s]?c ports?)\b/.test(text)) return "port";
  if (/\b(screens?|displays?|digitizer|lcd|oled)\b/.test(text)) return "display";
  // Check parts before devices: an iPhone screen assembly is not a phone.
  if (/\b(batter(y|ies)|display|screen|assembly|flex|speaker|port|keyboard|connector|camera|parts?|digitizer|lcd|oled|board|housing|cable|motor|propellers?|gimbal|thumbsticks?|analog|fan|backlight)\b/.test(text)) return "part";
  const device = deviceImageSource(text);
  if (device) return device.kind;
  if (/\b(phones?|smartphones?|iphone|galaxy|pixel|handset)\b/.test(text)) return "phone";
  return "product";
}

const CATEGORY_IMAGES = {
  phone: { src: "/images/products/phone.webp", label: "Phone" },
  protector: { src: "/images/products/screen-protector.webp", label: "Screen protector" },
  case: { src: "/images/products/clear-case.webp", label: "Protective case" },
  charger: { src: "/images/products/charger.webp", label: "Charger" },
  display: { src: "/images/products/display-assembly.webp", label: "Replacement display assembly" },
  port: { src: "/images/products/charging-port.webp", label: "Charging port assembly" },
} as const;

function catalogImage(key: string, label: string) {
  return { src: `/images/products/${key}.webp`, label };
}

/** Family imagery describes the device type, never an exact make or model. */
export function deviceImageSource(text: string): { src: string; label: string; kind: "phone" | "tablet" | "television" | "console" | "drone" } | null {
  const value = text.toLowerCase();
  if (/\b(drones?|quadcopter|mavic|phantom|dji)\b/.test(value)) return { ...catalogImage("drone", "Drone"), kind: "drone" };
  if (/\b(steam\s*deck|rog\s*ally|handheld|nintendo\s*switch)\b/.test(value)) return { ...catalogImage("handheld-console", "Handheld console"), kind: "console" };
  if (/\b(console|playstation|ps[345]|xbox|gaming|game\s*repair|nintendo)\b/.test(value)) return { ...catalogImage("game-console", "Game console"), kind: "console" };
  if (/\b(tv|televisions?|smart\s*tv|qled)\b/.test(value)) return { ...catalogImage("television", "Television"), kind: "television" };
  if (/\b(ipad|tablets?|galaxy\s*tab)\b/.test(value)) return { ...catalogImage("tablet", "Tablet"), kind: "tablet" };
  if (/\b(phones?|smartphones?|iphone|galaxy|pixel|handset|mobile)\b/.test(value)) return { ...catalogImage("phone", "Phone"), kind: "phone" };
  return null;
}

function categoryImage(product: ProductImageInput) {
  const text = `${product.name} ${product.category ?? ""}`.toLowerCase();
  const kind = productImageKind(product);
  const device = deviceImageSource(text);
  // A service card depicts the type of device being repaired, not a part for sale.
  if (kind === "service") return device ?? catalogImage("repair-tools", "Repair tools");
  if (device?.kind === "drone") {
    if (/propellers?|rotor\s*blades?/.test(text)) return catalogImage("drone-propellers", "Drone propellers");
    if (/batter(y|ies)/.test(text)) return catalogImage("drone-battery", "Drone battery");
    if (/camera|gimbal/.test(text)) return catalogImage("drone-camera-gimbal", "Drone camera and gimbal");
    if (/motor/.test(text)) return catalogImage("drone-motor", "Drone motor");
    if (/controller|remote/.test(text)) return catalogImage("drone-controller", "Drone controller");
    return kind === "part" ? null : device;
  }
  if (device?.kind === "television") {
    if (/backlight|led\s*strips?/.test(text)) return catalogImage("tv-backlight-strips", "TV backlight strips");
    if (/power\s*(supply|board)|psu/.test(text)) return catalogImage("tv-power-board", "TV power board");
    if (/main\s*board|motherboard|logic\s*board/.test(text)) return catalogImage("tv-main-board", "TV main board");
    if (/remote/.test(text)) return catalogImage("tv-remote", "TV remote");
    // A phone display assembly cannot stand in for a replacement TV panel.
    return ["part", "display", "port"].includes(kind) ? null : device;
  }
  if (/\b(hdmi)\b/.test(text) && /port|connector|socket/.test(text)) return catalogImage("hdmi-port", "HDMI port");
  if (/\b(analog|thumbstick|joystick)\b/.test(text)) return catalogImage("analog-stick", "Analog stick module");
  if (/\b(gamepad|dualshock|dualsense|controller)\b/.test(text)) return catalogImage("game-controller", "Game controller");
  if (device?.kind === "console") {
    if (/cooling|fans?|heatsink/.test(text)) return catalogImage("console-cooling-fan", "Console cooling fan");
    return kind === "part" || kind === "display" ? null : device;
  }
  if (/\b(precision|repair)\s*(tools?|screwdrivers?)\b/.test(text)) return catalogImage("repair-tools", "Repair tools");
  if (/\b(laptop|macbook|notebook|thinkpad|computer|desktop|printer|dslr|smartwatch|gopro|nikon|canon)\b/.test(text)) return null;
  if (/\b(back\s*glass|rear\s*glass|back\s*panel)\b/.test(text)) return catalogImage("back-glass", "Phone back glass");
  if (/\b(batter(y|ies))\b/.test(text)) return catalogImage("phone-battery", "Phone battery");
  if (/\b(camera|lens)\b/.test(text)) return catalogImage("camera-module", "Phone camera module");
  if (/\b(earpiece|speaker)\b/.test(text)) return catalogImage("earpiece-speaker", "Phone speaker assembly");
  if (/\b(usb[-\s]?c|charging)\s*cables?\b/.test(text)) return catalogImage("usb-c-cable", "USB-C cable");
  if (/\b(circuit|logic|mother|main)\s*boards?\b/.test(text)) return catalogImage("circuit-board", "Mobile circuit board");
  if (kind in CATEGORY_IMAGES) return CATEGORY_IMAGES[kind as keyof typeof CATEGORY_IMAGES];
  return kind === "part" ? null : device;
}

export function productImageSource(product: ProductImageInput) {
  // Only the authenticated file endpoint is a valid persisted photo URL.
  if (product.imageUrl && /^\/files\/[A-Za-z0-9_-]+$/.test(product.imageUrl)) {
    return { src: product.imageUrl, alt: product.name, illustrative: false, kind: productImageKind(product) };
  }
  const kind = productImageKind(product);
  const image = categoryImage(product);
  return {
    src: image?.src ?? null,
    alt: image ? `${image.label} category illustration` : `No photo for ${product.name}`,
    illustrative: true,
    kind,
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
