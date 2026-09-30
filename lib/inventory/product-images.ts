/** Product photos take priority; category illustrations never imply an exact model. */
export type ProductImageInput = {
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

export type ProductImageKind = "phone" | "protector" | "case" | "charger" | "display" | "port" | "part" | "service" | "product";

export function productImageKind({ name, category }: ProductImageInput): ProductImageKind {
  const text = `${category ?? ""} ${name}`.toLowerCase();
  if (/\b(services?|labou?r|diagnostics?|installation|cleaning|unlock)\b/.test(text) || /\brepairs?$/.test(name.toLowerCase()) || /^repairs?$/.test(category?.trim().toLowerCase() ?? "")) return "service";
  if (/\b(screen\s*(guard|protector|protection)|tempered\s*glass)\b/.test(text)) return "protector";
  if (/\b(case|cover|bumper)\b/.test(text)) return "case";
  if (/\b(charger|charging adapter|power adapter|wall adapter)\b/.test(text)) return "charger";
  if (/\b(charging ports?|charge ports?|usb[-\s]?c ports?)\b/.test(text)) return "port";
  if (/\b(screens?|displays?|digitizer|lcd|oled)\b/.test(text)) return "display";
  // Check parts before devices: an iPhone screen assembly is not a phone.
  if (/\b(batter(y|ies)|display|screen|assembly|flex|speaker|port|keyboard|connector|camera|parts?|digitizer|lcd|oled|board|housing|cable)\b/.test(text)) return "part";
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

export function productImageSource(product: ProductImageInput) {
  // Only the authenticated file endpoint is a valid persisted photo URL.
  if (product.imageUrl && /^\/files\/[A-Za-z0-9_-]+$/.test(product.imageUrl)) {
    return { src: product.imageUrl, alt: product.name, illustrative: false, kind: productImageKind(product) };
  }
  const kind = productImageKind(product);
  const image = kind in CATEGORY_IMAGES ? CATEGORY_IMAGES[kind as keyof typeof CATEGORY_IMAGES] : null;
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
