import { CATALOG } from "@/lib/catalog/entries";
import { bestCatalogMatch, catalogEntryByKey, catalogSearch, CATALOG_GROUPS, matchCatalog } from "@/lib/catalog/match";
import type { CatalogEntry } from "@/lib/catalog/types";

/**
 * The thinking behind the product picture picker, with no React in it so it can be tested on its own.
 *
 * Which picture a product ends up with is decided by lib/inventory/product-images.ts (photo, then the
 * picture somebody chose, then the one found from the name). This module only explains that choice in
 * plain words for the screen and prepares what the picker lists: the "Is it one of these?" row and the
 * search / group view inside the "Change picture" window. The server never trusts any of it.
 */

export type PictureInput = {
  /** What has been typed so far as the item name. */
  name: string;
  category?: string | null;
  /** Key of the picture chosen on purpose, or "" for "pick it from the name". */
  value?: string | null;
  /** The product's own photo (a /files/... path or a browser preview), if there is one. */
  uploadedPhotoUrl?: string | null;
};

/** Where the picture on screen comes from. */
export type PictureSource = "uploaded" | "chosen" | "found" | "none";

export type PictureChoice = {
  /** What the person sees: their own photo wins, then the one they chose, then the one found, then nothing. */
  source: PictureSource;
  /** The picture from the shop's collection that is used (chosen or found). Under a photo it is the one used without the photo. */
  entry: CatalogEntry | null;
  /** How `entry` was picked. */
  entrySource: "chosen" | "found" | "none";
  /** The own photo, when there is one. */
  photoUrl: string | null;
  /** The key to send to the server: a real picture key, or "" for automatic. */
  chosenKey: string;
  /** One plain sentence under the preview. */
  sentence: string;
  /** The same sentence without the "Pick one below." tail, for places that have no picker below them. */
  short: string;
  /** Only with an own photo: what is used when the photo is removed. */
  fallbackSentence: string | null;
};

const FOUND = "found from the name";
const CHOSEN = "chosen by you";

/** The key of a picture chosen on purpose, or "" when nothing valid was chosen (so: automatic). */
export function validPictureKey(value: string | null | undefined): string {
  return catalogEntryByKey(value)?.key ?? "";
}

export function resolvePicture(input: PictureInput): PictureChoice {
  const name = input.name ?? "";
  const chosen = catalogEntryByKey(input.value);
  const entry = chosen ?? bestCatalogMatch({ name, category: input.category });
  const entrySource = chosen ? "chosen" : entry ? "found" : "none";
  const photoUrl = input.uploadedPhotoUrl?.trim() ? input.uploadedPhotoUrl.trim() : null;

  const named = name.trim() !== "";
  const entrySentence = (lead: string) =>
    entry ? `${lead}: ${entry.label} (${chosen ? CHOSEN : FOUND})` : named ? "No picture matched yet. Pick one below." : "Type the item name and a picture appears. Or pick one below.";

  return {
    source: photoUrl ? "uploaded" : entrySource,
    entry,
    entrySource,
    photoUrl,
    chosenKey: chosen?.key ?? "",
    sentence: photoUrl ? "Your own photo is used" : entrySentence("Picture"),
    short: photoUrl ? "Your own photo is used" : entry ? entrySentence("Picture") : named ? "No picture matched yet." : "No picture yet.",
    fallbackSentence: photoUrl ? (entry ? `${entrySentence("Picture if there is no photo")}` : "Picture if there is no photo: none matched yet") : null,
  };
}

/**
 * Up to `limit` pictures to offer as "Is it one of these?": the matcher's other guesses first, then what the
 * search box would find for the same words. Never the picture already on show. Empty for an empty name.
 */
export function pictureSuggestions(input: Pick<PictureInput, "name" | "category" | "value" | "uploadedPhotoUrl">, limit = 4): CatalogEntry[] {
  const name = (input.name ?? "").trim();
  if (name.length < 2 || limit <= 0) return [];
  const shown = resolvePicture(input).entry?.key ?? null;
  const out: CatalogEntry[] = [];
  const add = (entry: CatalogEntry) => {
    if (entry.key !== shown && !out.some((other) => other.key === entry.key)) out.push(entry);
  };
  for (const match of matchCatalog({ name, category: input.category }, limit + 2)) add(match.entry);
  if (out.length < limit) for (const entry of catalogSearch(name, limit + 4)) add(entry);
  return out.slice(0, limit);
}

/** The words on the button that opens the picture window. */
export function changeButtonLabel(choice: PictureChoice): string {
  return choice.source === "none" ? "Pick a picture" : "Change picture";
}

// ---------------------------------------------------------------------------------------------
// The "Change picture" window: search box and group tabs
// ---------------------------------------------------------------------------------------------

/** The tab that shows every picture (or every search hit). */
export const ALL_PICTURES = "All";

export type PictureTab = { name: string; count: number };

export type PicturePage = {
  /** The tab that is on (always one of `tabs`). */
  group: string;
  tabs: PictureTab[];
  entries: CatalogEntry[];
  /** True when a search is on. */
  searching: boolean;
};

const groupRank = new Map<string, number>(CATALOG_GROUPS.map((group, index) => [group.name, index]));
/** Every picture in tab order (group by group, the catalog's own order inside a group). */
const IN_TAB_ORDER: CatalogEntry[] = CATALOG.map((entry, index) => ({ entry, index }))
  .sort((a, b) => (groupRank.get(a.entry.group) ?? 99) - (groupRank.get(b.entry.group) ?? 99) || a.index - b.index)
  .map(({ entry }) => entry);

/** The tab the picture belongs to, or "All" when there is none. */
export function groupOfKey(key: string | null | undefined): string {
  return catalogEntryByKey(key)?.group ?? ALL_PICTURES;
}

/**
 * What the window lists for a search word and a tab. With a search on, the tabs count the hits per group
 * (groups with no hit disappear) and a tab that has no hits falls back to "All". Without one, the tabs are
 * the groups with the number of pictures in each.
 */
export function picturePage(query: string, group: string): PicturePage {
  const word = (query ?? "").trim();
  const base = word ? catalogSearch(word, CATALOG.length) : IN_TAB_ORDER;
  const counts = new Map<string, number>();
  for (const entry of base) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
  const tabs: PictureTab[] = [
    { name: ALL_PICTURES, count: base.length },
    ...CATALOG_GROUPS.filter((item) => (counts.get(item.name) ?? 0) > 0).map((item) => ({ name: item.name, count: counts.get(item.name) ?? 0 })),
  ];
  const on = tabs.some((tab) => tab.name === group) ? group : ALL_PICTURES;
  return { group: on, tabs, entries: on === ALL_PICTURES ? base : base.filter((entry) => entry.group === on), searching: Boolean(word) };
}
