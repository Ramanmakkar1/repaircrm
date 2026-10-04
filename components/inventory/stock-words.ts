/**
 * Small pieces of wording for the stock screens' dialogs and sheets, decided
 * once and testable without rendering. Pure: no db, no next/*, no React.
 */

/** "2 of 5 scanned", "All 5 scanned", or "6 scanned, only 5 arrived". */
export function serialCountWords(count: number, target: number): string {
  if (target <= 0) return `${count} scanned`;
  if (count === target) return target === 1 ? "Scanned" : `All ${target} scanned`;
  if (count > target) return `${count} scanned, only ${target} ${target === 1 ? "is" : "are"} needed`;
  return `${count} of ${target} scanned`;
}

/** "1 item", "7 items". */
export function itemsWord(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/**
 * The adjust-stock preview: "2 → 3" and the change in words ("1 added",
 * "2 taken off", "no change"), so the result is read, not worked out.
 */
export function stockChangeWords(from: number, to: number): { line: string; change: string } {
  const delta = to - from;
  const change =
    delta === 0 ? "No change" : delta > 0 ? `${delta} added` : `${Math.abs(delta)} taken off`;
  return { line: `${from} → ${to}`, change };
}

/**
 * The reasons a stock level moves, as big tiles with plain words. The value is
 * the stored reason (format.ts STOCK_REASONS), which the audit trail groups by;
 * only the words on the tile are friendlier.
 */
export const REASON_TILES: readonly { value: "Received" | "Sold" | "Damaged" | "Counted" | "Other"; label: string; hint: string }[] = [
  { value: "Received", label: "New stock came in", hint: "A delivery or a return" },
  { value: "Sold", label: "Sold", hint: "Sold outside the app" },
  { value: "Damaged", label: "Damaged or lost", hint: "Broken, faulty, missing" },
  { value: "Counted", label: "I counted the shelf", hint: "Fixing the number" },
  { value: "Other", label: "Something else", hint: "Add a note below" },
];
