/**
 * The image catalog: one entry per picture the shop owns, with the words people type for it.
 * Pure data and types, no React and no Node APIs, so it can run in the browser inside a picker.
 */

/** 1 = a whole device family, 2 = a broad category, 3 = a specific item or part. More specific wins. */
export type CatalogTier = 1 | 2 | 3;

export type CatalogEntry = {
  /** Stable id, also the file name: /images/catalog/<key>.webp (older pictures: /images/products/<key>.webp). */
  key: string;
  /** What staff see under the picture. */
  label: string;
  /** Tab name in a picker. Every entry belongs to exactly one group. */
  group: string;
  /** Public path of the picture. */
  image: string;
  /** Lowercase singular phrases a person might type: names, slang, trade names, spellings. */
  keywords: string[];
  tier: CatalogTier;
  /** Words that mean the name is NOT this item ("port" on a cable: a charging port is not a cable). */
  excludes?: string[];
  /** Device families this item belongs to. A name that mentions another device never gets it. */
  devices?: string[];
};

/**
 * How a name matched, best first: phrase, all words in any order, spaced differently, a typo.
 * Then the weaker ones: only the category said so, only a phone brand and model said so ("Redmi Note 12"),
 * or the name is repair work on a device.
 */
export type CatalogMatchReason = "phrase" | "tokens" | "compact" | "fuzzy" | "category" | "brand" | "service";

export type CatalogMatch = {
  entry: CatalogEntry;
  /** Higher is better. Only comparable within one call. */
  score: number;
  reason: CatalogMatchReason;
  /** The keyword that matched, for debugging and for explaining a pick. */
  keyword: string;
};

export type CatalogInput = { name: string; category?: string | null };

export type CatalogGroup = { name: string; count: number };
