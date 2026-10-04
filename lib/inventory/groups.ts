export type GroupProduct = {
  id: string;
  name: string;
  category: string | null;
  stockQty: number;
  /** A catalog picture someone chose on purpose for this product (lib/catalog key), if any. */
  catalogImage?: string | null;
};
export type StockGroup = {
  key: string;
  label: string;
  quantity: number;
  productIds: string[];
  /** The first picture chosen on purpose for a product on this shelf: the shelf can wear it. */
  chosenImage?: string | null;
};

/** Recognisable shelf groups, with existing shop categories as the fallback. */
export function inventoryGroup(product: Pick<GroupProduct, "name" | "category">) {
  const text = `${product.name} ${product.category ?? ""}`.toLowerCase();
  if (/screen\s*(?:guard|protector)|tempered\s*glass/.test(text)) return { key: "screen-guards", label: "Screen guards" };
  if (/batter(?:y|ies)/.test(text)) return { key: "batteries", label: "Batteries" };
  if (/screen|display|oled|lcd/.test(text)) return { key: "screens", label: "Screens" };
  if (/charging\s*port|connector|hdmi\s*port/.test(text)) return { key: "ports", label: "Ports & connectors" };
  if (/cable|charger|adapter/.test(text)) return { key: "charging", label: "Cables & chargers" };
  const label = product.category?.trim() || "Other items";
  return { key: `category:${label}`, label };
}

export function inventoryGroups(products: GroupProduct[]): StockGroup[] {
  const groups = new Map<string, StockGroup>();
  for (const product of products) {
    const { key, label } = inventoryGroup(product);
    const group: StockGroup = groups.get(key) ?? { key, label, quantity: 0, productIds: [] };
    group.quantity += product.stockQty;
    group.productIds.push(product.id);
    // No matcher here: only a picture someone already chose is carried, so this stays cheap on every load.
    if (!group.chosenImage && product.catalogImage) group.chosenImage = product.catalogImage;
    groups.set(key, group);
  }
  const priority = ["screen-guards", "screens", "batteries", "ports", "charging"];
  const order = (key: string) => priority.includes(key) ? priority.indexOf(key) : priority.length;
  return [...groups.values()].sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label));
}

const GROUP_PHOTOS: Record<string, string> = {
  all: "/images/products/repair-tools.webp",
  "screen-guards": "/images/products/screen-protector.webp",
  batteries: "/images/products/phone-battery.webp",
  screens: "/images/products/display-assembly.webp",
  ports: "/images/products/charging-port.webp",
  charging: "/images/products/charger.webp",
};

/** The parts organiser: the picture for any shelf with no better one ("Parts / Input", a shop's own category). */
const GENERIC_SHELF_PHOTO = "/images/home/parts-bin.webp";

/** A picture for a stock group box, so staff can find a shelf by sight. Every shelf gets one. */
export function groupPhoto(key: string, label: string, fallback: (label: string) => string | null): string {
  return GROUP_PHOTOS[key] ?? fallback(label) ?? GENERIC_SHELF_PHOTO;
}
