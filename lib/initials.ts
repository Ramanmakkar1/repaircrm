/**
 * Up to two uppercase initials: first and last word, or the first two letters
 * of a single word. Pure, so client and server components share it.
 *
 * Counted in code points, not UTF-16 units, and words with no letter or digit
 * (an emoji, a dash) are passed over: `"ESD №7 🏫"[…][0]` used to take half of
 * the emoji's surrogate pair and the avatar showed "E�".
 */
export function nameInitials(name: string | null | undefined, fallback = "?"): string {
  const all = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const words = all.filter((word) => /[\p{L}\p{N}]/u.test(word));
  const parts = words.length > 0 ? words : all;
  if (parts.length === 0) return fallback;
  const first = [...parts[0]];
  if (parts.length === 1) return first.slice(0, 2).join("").toUpperCase();
  return (first[0] + [...parts[parts.length - 1]][0]).toUpperCase();
}
