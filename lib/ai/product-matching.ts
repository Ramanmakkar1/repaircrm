function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function singular(word: string): string {
  return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let col = 1; col <= b.length; col++) current[col] = Math.min(current[col - 1] + 1, previous[col] + 1, previous[col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

export function productSearchTokens(query: string): string[] {
  return words(query).map(singular).slice(0, 5);
}

/** Broaden read-only candidates for common shop vocabulary and speech mistakes. */
export function productCandidateTokens(query: string): string[] {
  const tokens = productSearchTokens(query);
  return /\bscreen\s+(?:guard|card|protector)s?\b|\btempered\s+glass\b/i.test(query)
    ? [...new Set([...tokens, "screen guard", "screen protector", "tempered glass"])]
    : tokens;
}

/** Suggestions only: close spellings must never resolve an inventory write. */
export function possibleProductMatch(query: string, product: { name: string; sku: string | null; category: string | null }): boolean {
  const wanted = productSearchTokens(query);
  const candidates = words(`${product.name} ${product.sku ?? ""} ${product.category ?? ""}`).map(singular);
  if (/screen\s+(?:guard|protector)s?|tempered\s+glass/i.test(`${product.name} ${product.category ?? ""}`)) candidates.push("screen", "guard", "protector", "tempered", "glass");
  return wanted.length > 0 && wanted.every((token) => candidates.some((candidate) => {
    if (candidate === token) return true;
    // Phone model numbers and SKUs must match exactly, even for suggestions.
    if (/\d/.test(token) || /\d/.test(candidate) || Math.min(token.length, candidate.length) < 4) return false;
    const limit = Math.max(token.length, candidate.length) >= 5 ? 2 : 1;
    return Math.abs(token.length - candidate.length) <= limit && distance(token, candidate) <= limit;
  }));
}
