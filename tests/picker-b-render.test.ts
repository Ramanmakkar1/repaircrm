import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * First paint of the product picture picker and of the Add / Edit product form. Decidable from the markup:
 * the picker says in one plain sentence which picture is used and why, posts the "catalogImage" field
 * (a picture key, or "" for "pick it from the name"), and the Easy form keeps every field of the full one,
 * with only the name, the price and the quantity out in the open.
 */

// The form only needs the actions to exist; nothing here ever runs one.
vi.mock("@/app/(app)/inventory/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));
vi.mock("@/app/(app)/scan/actions", () => ({ resolveScanAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => createElement("img", { alt: props.alt, src: props.src }),
}));

const { ProductPicturePicker } = await import("@/components/inventory/image-picker");
const { ProductForm } = await import("@/components/inventory/product-form");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const noop = () => {};
const picker = (props: Partial<React.ComponentProps<typeof ProductPicturePicker>>) =>
  html(createElement(ProductPicturePicker, { name: "", value: "", onChange: noop, ...props }));

/** The value of every <input name="..."> with that name. */
const inputs = (markup: string, name: string) =>
  [...markup.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]).filter((tag) => new RegExp(`\\bname="${name}"`).test(tag));
const valueOf = (tag: string) => /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "";

describe("ProductPicturePicker: what it says", () => {
  it("found from the name: the sentence, the picture, 'Change picture', and an empty catalogImage", () => {
    const markup = picker({ name: "glass guard" });
    expect(markup).toContain("Picture: Screen protector (found from the name)");
    expect(markup).toContain("/images/");
    expect(markup).toContain("Change picture");
    expect(markup).not.toContain("Use automatic");
    const field = inputs(markup, "catalogImage");
    expect(field).toHaveLength(1);
    expect(field[0]).toContain('type="hidden"');
    expect(valueOf(field[0])).toBe("");
  });

  it("chosen by you: the sentence says so, the key is posted, and 'Use automatic' is there", () => {
    const markup = picker({ name: "glass guard", value: "car-charger" });
    expect(markup).toContain("Picture: Car charger (chosen by you)");
    expect(markup).toContain("Use automatic");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("car-charger");
  });

  it("a key that is not a picture is posted as automatic", () => {
    const markup = picker({ name: "glass guard", value: "made-up" });
    expect(markup).toContain("found from the name");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("");
    expect(markup).not.toContain("Use automatic");
  });

  it("nothing matched: says so, offers 'Pick a picture' and shows no picture", () => {
    const markup = picker({ name: "xyzqq" });
    expect(markup).toContain("No picture matched yet. Pick one below.");
    expect(markup).toContain("Pick a picture");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("Is it one of these?");
  });

  it("no name yet: asks for one", () => {
    expect(picker({ name: "" })).toContain("Type the item name and a picture appears.");
  });

  it("an uploaded photo wins and the picker explains the fallback", () => {
    const markup = picker({ name: "glass guard", uploadedPhotoUrl: "/files/abc123" });
    expect(markup).toContain("Your own photo is used");
    expect(markup).toContain('src="/files/abc123"');
    expect(markup).toContain("Picture if there is no photo: Screen protector (found from the name)");
    expect(markup).toContain("Change picture");
    expect(markup).not.toContain("Picture: Screen protector");
  });

  it("offers 'Is it one of these?' as buttons, one tap each, for a name it cannot place", () => {
    const markup = picker({ name: "hdmi" });
    expect(markup).toContain("Is it one of these?");
    expect(markup).toMatch(/aria-label="Use HDMI cable"/);
    // Every guess is a real button (a tap target), not a link or a bare image.
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*aria-label="Use [^"]+"/);
  });

  it("the posted field can be renamed", () => {
    const markup = picker({ name: "glass guard", fieldName: "picture" });
    expect(inputs(markup, "picture")).toHaveLength(1);
    expect(inputs(markup, "catalogImage")).toHaveLength(0);
  });

  it("the window starts closed (nothing of it is on the page)", () => {
    const markup = picker({ name: "glass guard" });
    expect(markup).not.toContain("Pick a picture<"); // the window's title
    expect(markup).not.toContain("Search pictures");
  });
});

describe("ProductPicturePicker: compact", () => {
  it("is one tap target that names the picture and the action, and still posts the field", () => {
    const markup = picker({ name: "glass guard", compact: true });
    expect(markup).toMatch(/<button[^>]*aria-label="Picture: Screen protector \(found from the name\)\. Change picture"/);
    expect(markup).toContain("Change");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("");
  });

  it("only offers guesses when nothing matched, to stay short", () => {
    expect(picker({ name: "glass guard", compact: true })).not.toContain("Is it one of these?");
    expect(picker({ name: "hdmi", compact: true })).toContain("Is it one of these?");
  });

  it("with a chosen picture, posts its key", () => {
    expect(valueOf(inputs(picker({ name: "x", value: "charger", compact: true }), "catalogImage")[0])).toBe("charger");
  });
});

// ---------------------------------------------------------------------------------------------

const vendors = [{ id: "v1", name: "Meridian Component Group" }];
const existing = {
  id: "p1",
  name: "Glass guard iPhone 14",
  category: "Accessories",
  sku: "ACC-1",
  upc: null,
  description: null,
  priceCents: 1999,
  costCents: 700,
  taxable: true,
  stockQty: 7,
  lowStockAt: 2,
  warrantyDays: null,
  reorderQty: null,
  vendorId: null,
  vendorSku: null,
  serialized: false,
  active: true,
  imageUrl: null,
  catalogImage: null as string | null,
};

const EVERY_FIELD = [
  "name", "price", "stockQty", "category", "sku", "upc", "description", "cost", "warrantyDays",
  "taxable", "vendorId", "vendorSku", "reorderQty", "lowStockAt", "serialized", "active",
];

describe("ProductForm: Easy mode (add)", () => {
  const markup = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: true }));

  it("shows the three things that matter, the picture, and one big Add product button", () => {
    expect(markup).toContain("Item name");
    expect(markup).toContain("Selling price");
    expect(markup).toContain("Quantity in stock");
    expect(markup).toContain("Type the item name and a picture appears.");
    // The button is in the page and, on a phone, in the pinned bar too: never two on the same screen size.
    expect(markup.match(/>Add product</g)?.length).toBe(2);
    expect(markup).not.toContain("Create product");
  });

  it("posts the picture field once, empty (automatic)", () => {
    const field = inputs(markup, "catalogImage");
    expect(field).toHaveLength(1);
    expect(valueOf(field[0])).toBe("");
  });

  it("keeps every field of the full form, under one More details", () => {
    expect(markup.match(/<details/g)).toHaveLength(1);
    expect(markup).toContain("More details");
    for (const heading of ["About this item", "Your own photo", "Codes", "Money", "Supplier", "Stock rules"]) {
      expect(markup).toContain(`>${heading}<`);
    }
    for (const name of EVERY_FIELD) expect(markup, name).toMatch(new RegExp(`name="${name}"`));
    // The basics are NOT inside the disclosure.
    const [before] = markup.split("<details");
    for (const name of ["name", "price", "stockQty"]) expect(before, name).toMatch(new RegExp(`name="${name}"`));
    for (const name of ["category", "sku", "upc", "cost", "vendorId", "lowStockAt"]) expect(before, name).not.toMatch(new RegExp(`name="${name}"`));
  });

  it("cost is owner-only", () => {
    const staff = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: false }));
    expect(inputs(staff, "cost")).toHaveLength(0);
    expect(inputs(markup, "cost")).toHaveLength(1);
  });

  it("a scanned code seeds the form (?upc= and ?sku=)", () => {
    const seeded = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: true, defaults: { upc: "0123456789012", sku: "MY-SKU" } }));
    expect(valueOf(inputs(seeded, "upc")[0])).toBe("0123456789012");
    expect(valueOf(inputs(seeded, "sku")[0])).toBe("MY-SKU");
    // The code sits under More details, so the page says it is there.
    expect(seeded).toContain("from your scan is saved with this product");
    expect(markup).not.toContain("from your scan");
  });

  it("uses big boxes (56px) for the three that matter and starts on the name", () => {
    expect(markup).toContain("h-14");
    expect(markup).toMatch(/<input[^>]*id="name"[^>]*/);
  });
});

describe("ProductForm: Easy mode (edit)", () => {
  it("shows the picture the product has chosen, selected, and 'Save changes'", () => {
    const markup = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: true, product: { ...existing, catalogImage: "car-charger" } }));
    expect(markup).toContain("Picture: Car charger (chosen by you)");
    expect(markup).toContain("Use automatic");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("car-charger");
    expect(markup).toContain(">Save changes<");
    expect(markup).toContain('name="id"');
  });

  it("stock only moves through the adjust dialog: no quantity box, a note instead", () => {
    const markup = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: true, product: existing }));
    expect(inputs(markup, "stockQty")).toHaveLength(0);
    expect(markup).toContain("In stock now");
    expect(markup).toContain("found from the name");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("");
  });

  it("a product with its own photo says the photo is used", () => {
    const markup = html(createElement(ProductForm, { simple: true, vendors, canSeeCost: true, product: { ...existing, imageUrl: "/files/abc123", catalogImage: "charger" } }));
    expect(markup).toContain("Your own photo is used");
    expect(markup).toContain("Picture if there is no photo: Charger (chosen by you)");
    // The chosen fallback is still posted.
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("charger");
  });
});

describe("ProductForm: Full mode", () => {
  it("keeps the form it had (Create product, Add inventory) and gains a compact picture row beside the name", () => {
    const markup = html(createElement(ProductForm, { vendors, canSeeCost: true }));
    expect(markup).toContain("Create product");
    expect(markup).toContain("Add inventory");
    expect(markup).toContain("More details · photo, cost, barcode, supplier");
    expect(inputs(markup, "catalogImage")).toHaveLength(1);
    expect(markup).toMatch(/aria-label="[^"]*Change picture"|aria-label="[^"]*Pick a picture"/);
    for (const name of EVERY_FIELD) expect(markup, name).toMatch(new RegExp(`name="${name}"`));
  });

  it("edit keeps the dense form and shows the chosen picture", () => {
    const markup = html(createElement(ProductForm, { vendors, canSeeCost: true, product: { ...existing, catalogImage: "charger" } }));
    expect(markup).toContain("Save changes");
    expect(markup).toContain("Picture: Charger (chosen by you)");
    expect(valueOf(inputs(markup, "catalogImage")[0])).toBe("charger");
    expect(markup).toContain("Reorder point");
    expect(markup).toContain("Stock on hand is currently");
  });
});
