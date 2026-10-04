import { catalogEntryByKey } from "@/lib/catalog/match";

/**
 * The "catalogImage" form field: the key of an on-server catalog picture somebody chose on purpose,
 * or the empty string for "pick it automatically from the name".
 *
 * Pure, no Node APIs. The picker previews with this too, but the server never trusts the browser:
 * whatever arrives is run through here before it reaches the database.
 */
export const CATALOG_IMAGE_FIELD = "catalogImage";

/** A real catalog key, or null. Empty, unknown, padded-garbage and non-string input all mean "automatic". */
export function normalizeCatalogImage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return catalogEntryByKey(raw.trim())?.key ?? null;
}

/**
 * Reads the field off a submitted form. `present` tells an update whether the form carried the field at
 * all: a caller that omits it must never wipe a picture somebody chose, while an empty value on purpose
 * ("automatic") clears it.
 */
export function readCatalogImageField(formData: FormData): { present: boolean; value: string | null } {
  return {
    present: formData.has(CATALOG_IMAGE_FIELD),
    value: normalizeCatalogImage(formData.get(CATALOG_IMAGE_FIELD)),
  };
}
