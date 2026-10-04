/**
 * Reading a typed record number the way people actually write it.
 *
 * Every card, printout and receipt in the app writes numbers as "#1012", the
 * accounting export writes "INV-1012", and people say "repair 1012" or
 * "invoice 1012". All of those must find the record. A word in front names
 * which kind is meant; a bare number or "#1012" could be any of them.
 */

export type RecordKind = "ticket" | "invoice" | "estimate";

export type RecordQuery = { number: number; kind: RecordKind | null };

const PREFIXES: [RegExp, RecordKind][] = [
  [/^(?:r|rep|repair|repairs|t|tk|tkt|ticket|tickets|job|wo|work\s*order)$/, "ticket"],
  [/^(?:i|inv|invoice|invoices|bill|receipt)$/, "invoice"],
  [/^(?:e|est|estimate|estimates|q|quote)$/, "estimate"],
];

/**
 * The number (and kind, when a word says so) in `query`, or null when the
 * query is not a record number. "#1012", "1012", "INV-1012", "inv 1012",
 * "Invoice #1012", "R-1012", "repair no. 1012", "EST1012" all parse; a phone
 * number ("555-0178", "(512) 555 0142") and a name never do.
 */
export function parseRecordQuery(query: string): RecordQuery | null {
  const text = query.trim().toLowerCase();
  if (!text) return null;

  const bare = /^(?:#|no\.?\s*|nr\.?\s*)?\s*(\d{1,9})$/.exec(text);
  if (bare) return { number: Number(bare[1]), kind: null };

  const prefixed = /^([a-z]+(?:\s+order)?)\s*[-#:.]?\s*(?:#|no\.?|number)?\s*(\d{1,9})$/.exec(text);
  if (!prefixed) return null;
  const word = prefixed[1].trim();
  for (const [pattern, kind] of PREFIXES) {
    if (pattern.test(word)) return { number: Number(prefixed[2]), kind };
  }
  return null;
}

/** Should this kind of record be looked up by number for this query? */
export function numberFor(parsed: RecordQuery | null, kind: RecordKind): number | null {
  if (!parsed) return null;
  return parsed.kind === null || parsed.kind === kind ? parsed.number : null;
}
