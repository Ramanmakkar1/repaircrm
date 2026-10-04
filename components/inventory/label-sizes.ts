/**
 * The three label sizes the shelf-label sheet can print. Pure, so the page, the
 * controls and the tests read one list.
 *
 *  - sheet: the 3-across sheet of address-label stock most shops have (Letter or A4).
 *  - roll:  one label per page, for a roll / thermal label printer (2.25" × 1.25").
 *  - small: tiny 4-across tags, price and barcode only, for small bins and hooks.
 */
export type LabelSize = "sheet" | "roll" | "small";

export const LABEL_SIZES: readonly { key: LabelSize; label: string; hint: string }[] = [
  { key: "sheet", label: "Sheet", hint: "3 across, Letter or A4" },
  { key: "roll", label: "Label printer", hint: "One at a time, 2¼ × 1¼ in" },
  { key: "small", label: "Small tag", hint: "4 across, price and barcode" },
];

export function asLabelSize(value: string | undefined): LabelSize {
  return value === "roll" || value === "small" ? value : "sheet";
}

/** How big the barcode is drawn for each size: wide enough bars for a phone camera to read. */
export const BARCODE_SIZE: Record<LabelSize, { height: number; width: number }> = {
  sheet: { height: 32, width: 1.4 },
  roll: { height: 40, width: 1.6 },
  small: { height: 24, width: 1.1 },
};
