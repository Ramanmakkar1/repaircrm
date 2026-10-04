import { CATALOG, CATALOG_GROUP_ORDER } from "./entries";
import type { CatalogEntry, CatalogGroup, CatalogInput, CatalogMatch, CatalogMatchReason } from "./types";

/**
 * Finds the catalog picture for a product name: forgiving about spelling, spacing, word order,
 * plurals, brands and model numbers, and strict about not showing a wrong picture.
 *
 * Order of trust: a specific item beats a broad category beats a whole device (so "iPhone 14 screen
 * assembly" is the display part, never a phone). Within that, the longer the matched phrase the better.
 * The category counts for very little and never overrides what the name says. A device's spec sheet ("4GB RAM, Dual SIM,
 * 6000mAh") and its boxed extras ("with charger and cable") are read as part of the device, not as items for sale.
 * Pure TypeScript, no Node APIs: it also runs in the browser inside the picker.
 */

// ---------------------------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------------------------

const SPECIAL_SINGULARS: Record<string, string> = { lenses: "lens", mice: "mouse", glasses: "glass", men: "man" };
/** Words that end in "s" but are not plurals. */
const NOT_PLURAL = new Set(["lens", "gas", "canvas", "atlas", "bios", "macos", "ios", "always", "news", "perhaps", "yes", "has", "was", "its", "his", "chassis"]);
const SHORT_PLURALS = new Set(["tvs", "pcs", "cds", "sds", "dvds"]);
/** Little words people add ("case for iPhone", "touch and display"). They carry no meaning for a match. */
const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "by", "at", "from"]);

function singular(word: string): string {
  const special = SPECIAL_SINGULARS[word];
  if (special) return special;
  if (NOT_PLURAL.has(word)) return word;
  if (SHORT_PLURALS.has(word)) return word.slice(0, -1);
  if (word.length <= 3 || !/^\p{L}+$/u.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Lowercase, accents gone, punctuation and hyphens to single spaces. Keeps every word. */
function clean(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019`]/g, "")
    // "6.1 inch" is one size, not "6" and "1"; "1,000" is one number.
    .replace(/(\d)[.,](?=\d)/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    // "(pack of 5)", "10 pcs": how many, not what.
    .replace(/\b(?:pack|set|box|lot) of \d+\b/g, " ")
    .replace(/\b\d+ (?:pcs|piece|pieces|unit|units|pack|packs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The shape a name is compared in: lowercase, no accents, punctuation and hyphens as single
 * spaces, and plurals made singular ("Screen-Guards" and "screen guard" are the same).
 */
export function normalize(text: string): string {
  const cleaned = clean(text);
  return cleaned ? cleaned.split(" ").map(singular).join(" ") : "";
}

/** The words one cleaned word stands for: plurals folded, sizes and wattages folded, little words dropped. */
function wordTokens(raw: string): string[] {
  if (!raw) return [];
  // "20W" and "65 W" are all just "a charger wattage"; "5000mAh" is "a battery capacity".
  let word = raw;
  if (/^\d+w$/.test(word)) word = "watt";
  else if (/^\d+mah$/.test(word)) word = "mah";
  // "iPhone14" is "iphone 14", "cat6" is "cat 6", "14promax" is "14 promax" (3+ letters only: "ps5", "s23" stay whole).
  const parts = word.replace(/(\p{L}{3,})(?=\p{N})/gu, "$1 ").replace(/(\p{N})(?=\p{L}{3,})/gu, "$1 ").split(" ");
  const out: string[] = [];
  for (const part of parts) {
    const token = singular(part);
    if (token && !STOP_WORDS.has(token)) out.push(token);
  }
  return out;
}

/** Normalised words for matching: plurals folded, sizes and wattages folded, little words dropped. */
function tokenize(text: string): string[] {
  return clean(text).split(" ").flatMap(wordTokens);
}

// ---------------------------------------------------------------------------------------------
// The index, built once when the module loads
// ---------------------------------------------------------------------------------------------

type Ref = { id: number; entry: number; keyword: string; tokens: string[]; phrase: string; compact: string; n: number };
type Kind = 1 | 2 | 3 | 4;
const FUZZY: Kind = 1;
const COMPACT: Kind = 2;
const TOKENS: Kind = 3;
const PHRASE: Kind = 4;
const KIND_REASON: Record<Kind, CatalogMatchReason> = { 1: "fuzzy", 2: "compact", 3: "tokens", 4: "phrase" };

type Evidence = { ref: Ref; kind: Kind; n: number; /** Letters a typo was off by, summed over the words. */ cost: number; /** Position of the last name word the keyword uses, -1 when unknown. */ end: number };

const phraseIndex = new Map<string, Ref[]>();
const compactIndex = new Map<string, Ref[]>();
const tokenIndex = new Map<string, { ref: Ref; need: number }[]>();
const vocab = new Set<string>();
/** How many pictures use each word: a word used by many is a real word, one used by one or two may be a spelling a person really types. */
const wordUse = new Map<string, Set<number>>();
const refs: Ref[] = [];
let maxPhrase = 1;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

CATALOG.forEach((entry, index) => {
  const seen = new Set<string>();
  for (const keyword of entry.keywords) {
    const tokens = tokenize(keyword);
    const phrase = tokens.join(" ");
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    const ref: Ref = { id: refs.length, entry: index, keyword, tokens, phrase, compact: tokens.join(""), n: tokens.length };
    refs.push(ref);
    maxPhrase = Math.max(maxPhrase, ref.n);
    push(phraseIndex, phrase, ref);
    // "i phone" and "iphone" are one word spelled two ways: only the shorter spelling is a spacing variant of the other.
    const sameCompact = compactIndex.get(ref.compact)?.find((other) => other.entry === index);
    if (ref.compact.length >= 3 && !(sameCompact && sameCompact.n <= ref.n)) {
      if (sameCompact) compactIndex.set(ref.compact, compactIndex.get(ref.compact)!.filter((other) => other !== sameCompact));
      push(compactIndex, ref.compact, ref);
    }
    const need = new Map<string, number>();
    for (const token of tokens) {
      need.set(token, (need.get(token) ?? 0) + 1);
      vocab.add(token);
    }
    for (const token of need.keys()) {
      const users = wordUse.get(token);
      if (users) users.add(index);
      else wordUse.set(token, new Set([index]));
    }
    // A keyword with a bare number in it ('6 port charger') only matches as written: stray numbers in a name must not complete it.
    if (ref.n > 1 && !tokens.some((token) => /^\d+$/.test(token))) for (const [token, count] of need) push(tokenIndex, token, { ref, need: count });
  }
});

const entryIndex = new Map(CATALOG.map((entry, index) => [entry.key, index]));

type EntryRules = { excludeWords: Set<string>; excludePhrases: string[][]; devices: Set<string>; /** Every word the picture's own keywords use. */ words: Set<string> };
const rules: EntryRules[] = CATALOG.map((entry) => {
  const excludeWords = new Set<string>();
  const excludePhrases: string[][] = [];
  for (const phrase of entry.excludes ?? []) {
    const tokens = tokenize(phrase);
    if (tokens.length === 1) excludeWords.add(tokens[0]);
    else if (tokens.length > 1) excludePhrases.push(tokens);
  }
  return { excludeWords, excludePhrases, devices: new Set(entry.devices ?? []), words: new Set(entry.keywords.flatMap(tokenize)) };
});

const DEVICE_GROUP = "Devices";
const isDeviceEntry = (index: number) => CATALOG[index].group === DEVICE_GROUP;

// ---------------------------------------------------------------------------------------------
// Typos
// ---------------------------------------------------------------------------------------------

/** Words that look like a catalog word with one letter off but are something else. */
const NO_FUZZY = new Set([
  // everyday shop words that must never turn into a product
  "service", "delivery", "discount", "shipping", "courier", "voucher", "coupon", "gift", "warranty", "deposit", "advance", "balance", "payment", "invoice", "labour", "labor",
  "extra", "other", "misc", "charged", "printed", "tracked", "item", "product", "general", "sample", "testing", "bundle", "offer", "special", "premium", "standard", "basic", "package", "charge", "fee", "tax", "refund", "return", "exchange",
  "wholesale", "retail", "stock", "supply", "order", "custom", "customer", "repair", "replacement", "original", "genuine", "quality", "price", "cash", "credit", "online", "store", "shop",
  // brands
  "apple", "samsung", "xiaomi", "redmi", "realme", "oppo", "vivo", "oneplus", "huawei", "honor", "nokia", "motorola", "lenovo", "dell", "asus", "acer", "sony", "philips", "panasonic", "toshiba", "hisense",
  "logitech", "razer", "corsair", "kingston", "sandisk", "seagate", "crucial", "epson", "brother", "garmin", "microsoft", "google", "intel", "nvidia", "amazon", "infinix", "tecno", "itel", "poco", "lava",
  "baseus", "ugreen", "anker", "belkin", "boat", "noise", "zebronics", "portronics", "ambrane", "spigen", "ringke", "vaporcell", "pixel", "ultra", "series", "sticker", "plain", "white", "black", "silver", "golden",
]);

const fuzzyCache = new Map<string, { word: string; dist: number }[]>();
/** Spellings the catalog lists on purpose ("scren guard" next to "screen guard"): a typo of a word the catalog also spells right. */
const variants = new Set<string>();

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Letters off, counting a swapped pair as one and one vowel for another ("adaptor") as one. A different consonant costs 2, so "magic" is not "mavic". Returns max + 1 when too far. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : VOWELS.has(a[i - 1]) && VOWELS.has(b[j - 1]) ? 1 : 2;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previous2[j - 2] + 1);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous2 = previous;
    previous = current;
  }
  return Math.min(previous[b.length], max + 1);
}

/** Typos rarely change the last letter ("printed" is not a typo of "printer"), except by swapping the last two ("cabel"). */
const sameEnding = (a: string, b: string) => a.at(-1) === b.at(-1) || (a.at(-1) === b.at(-2) && a.at(-2) === b.at(-1));

/**
 * Catalog words a mistyped word could have meant: 1 letter off from 5 letters, 2 letters off from 9,
 * same first and last letter (so "house" is not "mouse", "table" is not "cable", "printed" is not "printer"),
 * never just a word with a different ending ("charge" is not "charger": that is a different word, not a typo),
 * and never a short catalog word ("cause" is not "case").
 */
function fuzzyNeighbours(token: string): { word: string; dist: number }[] {
  const cached = fuzzyCache.get(token);
  if (cached) return cached;
  const found: { word: string; dist: number }[] = [];
  const max = token.length >= 9 ? 2 : token.length >= 5 ? 1 : 0;
  if (max > 0 && /^\p{L}+$/u.test(token) && (!vocab.has(token) || variants.has(token)) && !NO_FUZZY.has(token)) {
    for (const word of vocab) {
      if (word.length < 5 || word[0] !== token[0] || variants.has(word) || !/^\p{L}+$/u.test(word)) continue;
      if (word.startsWith(token) || token.startsWith(word) || !sameEnding(token, word)) continue;
      const dist = editDistance(token, word, max);
      if (dist <= max) found.push({ word, dist });
    }
  }
  if (fuzzyCache.size > 20000) fuzzyCache.clear();
  fuzzyCache.set(token, found);
  return found;
}

(() => {
  const near = (a: string, b: string) => {
    if (a.length < 4 || b.length < 4 || a[0] !== b[0] || a.startsWith(b) || b.startsWith(a) || !sameEnding(a, b)) return false;
    const max = Math.max(a.length, b.length) >= 9 ? 2 : 1;
    return editDistance(a, b, max) <= max;
  };
  // Keywords that differ in exactly one word, within one picture, are spellings of each other.
  const buckets = new Map<string, Set<string>>();
  for (const ref of refs) {
    ref.tokens.forEach((token, at) => {
      const key = `${ref.entry}|${at}|${ref.tokens.map((word, i) => (i === at ? "*" : word)).join(" ")}`;
      const set = buckets.get(key);
      if (set) set.add(token);
      else buckets.set(key, new Set([token]));
    });
  }
  // The spelling used by more pictures, then by more keywords, is the real one.
  const uses = new Map<string, number>();
  for (const ref of refs) for (const token of new Set(ref.tokens)) uses.set(token, (uses.get(token) ?? 0) + 1);
  const weight = (word: string) => (wordUse.get(word)?.size ?? 0) * 100000 + (uses.get(word) ?? 0);
  for (const set of buckets.values()) {
    const words = [...set];
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        if (!near(words[i], words[j])) continue;
        if (weight(words[i]) < weight(words[j])) variants.add(words[i]);
        else if (weight(words[j]) < weight(words[i])) variants.add(words[j]);
      }
    }
  }
})();

// ---------------------------------------------------------------------------------------------
// Finding evidence in a name
// ---------------------------------------------------------------------------------------------

function keep(into: Map<number, Evidence>, ref: Ref, kind: Kind, n = ref.n, cost = 0, end = -1) {
  const have = into.get(ref.entry);
  if (!have || n > have.n || (n === have.n && (kind > have.kind || (kind === have.kind && cost < have.cost)))) into.set(ref.entry, { ref, kind, n, cost, end });
}

function counts(tokens: string[]) {
  const map = new Map<string, number>();
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1);
  return map;
}

/** Every catalog entry a list of words points at, with the best evidence for each. */
function gather(tokens: string[], options: { fuzzy: boolean; compact: boolean }): Map<number, Evidence> {
  const found = new Map<number, Evidence>();
  const length = tokens.length;
  // 1. The words, in order, as one phrase.
  for (let start = 0; start < length; start++) {
    let phrase = "";
    for (let end = start; end < Math.min(length, start + maxPhrase); end++) {
      phrase = end === start ? tokens[end] : `${phrase} ${tokens[end]}`;
      const list = phraseIndex.get(phrase);
      if (list) for (const ref of list) keep(found, ref, PHRASE, ref.n, 0, end);
    }
  }
  // 2. All the words, in any order.
  const have = counts(tokens);
  const lastAt = new Map<string, number>();
  tokens.forEach((token, at) => lastAt.set(token, at));
  const gathered = new Map<number, number>();
  for (const [token, count] of have) {
    const list = tokenIndex.get(token);
    if (list) for (const { ref, need } of list) gathered.set(ref.id, (gathered.get(ref.id) ?? 0) + Math.min(count, need));
  }
  for (const [id, total] of gathered) if (total === refs[id].n) keep(found, refs[id], TOKENS, refs[id].n, 0, Math.max(...refs[id].tokens.map((word) => lastAt.get(word) ?? -1)));
  // 3. Spaced differently: "glassguard", "type c cable" typed as "typec cable".
  if (options.compact) {
    for (let start = 0; start < length; start++) {
      let joined = "";
      for (let end = start; end < Math.min(length, start + 4); end++) {
        joined += tokens[end];
        // Two or more words that run together to a short keyword count too ("ps 5" is "ps5"); one short word is just a word.
        const list = joined.length >= 4 || (end > start && joined.length >= 3) ? compactIndex.get(joined) : undefined;
        // Spaced differently counts for the words typed, not the words in the keyword ("iphone" is one word, however the keyword spells it).
        if (list) for (const ref of list) if (ref.phrase !== tokens.slice(start, end + 1).join(" ")) keep(found, ref, COMPACT, end - start + 1, 0, end);
      }
    }
  }
  // 4. Typos: swap each unknown word for the catalog words it could have meant, then match all words again.
  if (options.fuzzy) {
    const corrected = new Map(have);
    const added = new Map<string, number>();
    for (const token of have.keys()) {
      for (const { word, dist } of fuzzyNeighbours(token)) {
        if (have.has(word)) continue;
        corrected.set(word, (corrected.get(word) ?? 0) + 1);
        added.set(word, Math.min(added.get(word) ?? dist, dist));
      }
    }
    if (added.size) {
      const total = new Map<number, number>();
      for (const [token, count] of corrected) {
        const list = tokenIndex.get(token);
        if (list) for (const { ref, need } of list) total.set(ref.id, (total.get(ref.id) ?? 0) + Math.min(count, need));
      }
      const cost = (ref: Ref) => [...new Set(ref.tokens)].reduce((sum, word) => sum + (added.get(word) ?? 0), 0);
      for (const [id, sum] of total) {
        const ref = refs[id];
        if (sum === ref.n && ref.tokens.some((word) => added.has(word))) keep(found, ref, FUZZY, ref.n, cost(ref));
      }
      // One-word keywords have no index entry above: check them directly.
      for (const word of added.keys()) {
        const list = phraseIndex.get(word);
        if (list) for (const ref of list) if (ref.n === 1) keep(found, ref, FUZZY, 1, cost(ref));
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Rules around the evidence
// ---------------------------------------------------------------------------------------------

/** Words that make a name a service, not something for sale ("iPhone screen repair", "labour"). */
const SERVICE_WORDS = new Set(["repair", "repairing", "fix", "fixing", "service", "servicing", "labour", "labor", "diagnostic", "diagnosis", "installation"]);
/** Of those, the ones that say work on a thing (a bare "service charge" has no picture). */
const REPAIR_WORDS = new Set(["repair", "repairing", "fix", "fixing", "labour", "labor", "diagnostic", "diagnosis"]);
/** "Repair kit", "repair tape": a thing for sale, not a service. */
const SELLABLE_WORDS = new Set(["part", "spare", "kit", "tool", "glue", "adhesive", "mat", "tape", "screw", "machine", "station", "supply", "accessory", "material"]);
/** Parts a whole-device picture must never stand in for: a laptop photo is not a laptop battery. */
const PART_WORDS = new Set([
  "battery", "display", "screen", "lcd", "oled", "assembly", "flex", "speaker", "port", "keyboard", "connector", "part", "spare", "digitizer", "board", "housing", "cable", "motor", "propeller",
  "gimbal", "thumbstick", "analog", "fan", "backlight", "panel", "hinge", "jack", "motherboard", "button", "sensor", "chip", "socket", "module", "bezel", "frame", "touchpad", "trackpad", "tcon", "inverter", "tray", "ribbon",
  // inside a phone, a drone, a laptop: "iPhone 12 wifi antenna", "DJI Mini 3 arm", "MacBook palm rest"
  "antenna", "coil", "mesh", "fingerprint", "face", "arm", "esc", "landing", "shell", "palm", "touchbar", "bottom", "gasket", "bracket", "shield", "heatsink",
]);
/** "Phone accessories" and "other items" are not the phone: a name or category with one of these is not the device it mentions. */
const NOT_THE_DEVICE = new Set(["accessory", "supply", "tool", "kit", "item", "product", "other", "misc", "general", "gadget", "repair", "service", "stuff", "spare"]);
/** Things sold for a device, not the device ("DSLR strap", "PS5 stand", "headphone cushion"): a whole-device picture is no picture for them. */
const ACCESSORY_WORDS = new Set([
  "accessory", "supply", "kit", "item", "product", "other", "misc", "general", "gadget", "stuff",
  "strap", "mount", "dock", "stand", "faceplate", "cap", "flash", "bag", "pad", "wallet", "box", "sticker", "holder", "ring", "skin", "film", "protector", "pen", "filter", "lens", "cushion", "headband",
  "case", "cover", "decal", "hood", "grip", "cage", "handle", "charm",
]);
/** Device pictures the category alone may not choose: a mouse filed under "Computers" is not a computer. */
const NAME_ONLY_DEVICES = new Set(["laptop", "desktop-computer", "smartwatch", "headphones", "earbuds", "camera"]);
/** Groups whose small parts and drives are just a spec line when the name is a whole laptop or computer. */
const SPEC_GROUPS = new Set(["Laptop & computer parts", "Storage & memory"]);
/** Groups where the service words belong to the item itself ("water damage repair", "screwdriver for phone repair"). */
const SERVICE_PROOF_GROUPS = new Set(["Repair services", "Tools & supplies"]);

const REPAIR_TOOLS = entryIndex.get("repair-tools") ?? -1;
const PHONE = entryIndex.get("phone") ?? -1;
const PHONE_REF = refs.find((ref) => ref.entry === PHONE);
/** Samsung phone model codes: A54, S23, M31, F12. */
const SAMSUNG_MODEL = /^[asmfg]\d{2,3}[a-z]?$/;

type Analysis = { list: CatalogMatch[]; service: boolean };

function hasSequence(tokens: string[], sequence: string[]) {
  for (let i = 0; i + sequence.length <= tokens.length; i++) {
    if (sequence.every((word, j) => tokens[i + j] === word)) return true;
  }
  return false;
}

function excluded(index: number, tokens: string[], set: Set<string>) {
  const rule = rules[index];
  for (const word of rule.excludeWords) if (set.has(word)) return true;
  return rule.excludePhrases.some((sequence) => hasSequence(tokens, sequence));
}

type DeviceMention = { words: Set<string>; families: string[] };

/** The devices a name mentions. "galaxy watch" wins over the "galaxy" inside it. */
function deviceMentions(found: Map<number, Evidence>): DeviceMention[] {
  const devices = [...found].filter(([index]) => isDeviceEntry(index));
  const mentions: DeviceMention[] = [];
  for (const [index, evidence] of devices) {
    const mine = new Set(evidence.ref.tokens);
    const swallowed = devices.some(([other, theirs]) => other !== index && theirs.ref.tokens.length > mine.size && [...mine].every((word) => theirs.ref.tokens.includes(word)));
    if (!swallowed) mentions.push({ words: mine, families: CATALOG[index].devices ?? [] });
  }
  return mentions;
}

function familiesOf(mentions: DeviceMention[]): Set<string> {
  return new Set(mentions.flatMap((mention) => mention.families));
}

function overlaps(a: Set<string>, b: Set<string>) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

const SPEC_WORD = /^(\d+(gb|tb|mb)|i[3579]|ryzen|core|celeron|pentium)$/;
/** Brands that only make phones: they say which device a part is for, though they are not a picture themselves. */
const PHONE_BRANDS = new Set(["redmi", "realme", "vivo", "oppo", "oneplus", "poco", "nokia", "motorola", "infinix", "tecno", "itel", "iqoo", "xperia", "lava", "micromax"]);

/** Laptop model names say "laptop" without the word: "Lenovo IdeaPad 3 keyboard" is a laptop keyboard. */
const LAPTOP_MODELS = new Set(["ideapad", "inspiron", "latitude", "vostro", "elitebook", "probook", "zenbook", "vivobook", "aspire", "thinkbook", "pavilion", "xps"]);

/** A device with its extras in the box ("iPhone 14 with charger and cable"): the words after "with" are not what is for sale. */
const BUNDLE_LEAD = new Set(["with", "including", "incl"]);
const BUNDLED = new Set([
  "charger", "adapter", "adaptor", "cable", "wire", "cord", "box", "earphone", "handsfree", "headphone", "headset", "earbud", "bud", "case", "cover", "bag", "stand", "warranty", "bill", "invoice", "pouch", "strap",
  "manual", "mouse", "keyboard", "remote", "controller", "battery", "tripod", "lens", "card", "pen", "stylus", "dock", "glass", "protector", "guard", "accessory", "kit", "mount", "bracket", "wall", "plug",
  "power", "bank", "screen", "tempered", "temper", "back", "mic", "microphone", "sd", "memory", "micro", "hdmi", "game", "disc", "sim", "charging", "magsafe", "wireless", "gift", "pencil",
]);
/** Little words that ride along in such a list ("with free original charger", "with S Pen", "used, good condition"). */
const BUNDLE_FILLER = new Set(["free", "original", "genuine", "fast", "new", "extra", "usb", "type", "c", "s", "rc", "apple", "used", "refurbished", "refurb", "sealed", "unlocked", "condition", "good", "excellent", "year", "month", "gst"]);
const BUNDLE_LISTING = new Set(["included", "inclusive"]);
/** Keywords that say "with" themselves ("headset with mic"): a name that has one is left whole. */
const WITH_KEYWORDS = CATALOG.flatMap((entry) => entry.keywords.map(clean).filter((keyword) => keyword.includes(" with ")));

function isDeviceHead(tokens: string[]): boolean {
  if (tokens.some((word) => PHONE_BRANDS.has(word) || LAPTOP_MODELS.has(word) || (word === "samsung" && tokens.some((other) => SAMSUNG_MODEL.test(other))))) return true;
  return deviceMentions(gather(tokens, { fuzzy: false, compact: false })).length > 0;
}

/**
 * The words of a product name. When a device is followed by nothing but its extras ("iPhone 14 with charger and
 * cable", "Smart TV with wall mount and remote"), that tail is cut off: the device is not mistaken for its extras.
 */
function nameWords(text: string): string[] {
  const plain = clean(text);
  const words = plain.split(" ").filter(Boolean);
  const lead = words.findIndex((word, at) => at > 0 && BUNDLE_LEAD.has(word));
  if (lead < 0 || WITH_KEYWORDS.some((keyword) => plain.includes(keyword))) return words.flatMap(wordTokens);
  const tail = words.slice(lead + 1);
  const bundled = (word: string) => STOP_WORDS.has(word) || /^\d+[a-z]{0,3}$/.test(word) || BUNDLE_FILLER.has(word) || BUNDLE_LISTING.has(word) || BUNDLED.has(singular(word)) || LISTING_SPEC.test(word);
  if (!tail.some((word) => BUNDLED.has(singular(word))) || !tail.every(bundled)) return words.flatMap(wordTokens);
  const head = words.slice(0, lead).flatMap(wordTokens);
  return isDeviceHead(head) ? head : words.flatMap(wordTokens);
}

/** Words that start a phone or tablet listing: what follows the model is its spec sheet, not products. */
const PHONE_WORDS = new Set([...PHONE_BRANDS, "iphone", "ipad", "galaxy", "pixel", "phone", "mobile", "smartphone", "tablet", "tab", "xiaomi", "honor", "huawei", "moto"]);
/** Spec-sheet words that are never an item on a phone listing ("4GB RAM 64GB ROM", "5G", "50MP", "120Hz", "5nm Octa-Core Processor"). */
const LISTING_SPEC = /^(\d+(gb|tb|nm|mp|hz)|gb|tb|ram|rom|storage|[345]g|lte|standby|processor|chipset|octa|hexa|core)$/;
/** A SIM tray, holder or ejector is a part: "dual sim tray" is not a spec. */
const SIM_PART = new Set(["tray", "holder", "slot", "socket", "reader", "connector", "ejector", "eject", "pin", "needle", "opener", "tool", "flex", "bed", "trey", "key", "card"]);

/**
 * "Redmi 12 (4GB RAM, 128GB Storage)", "Galaxy A14 (Dual SIM)", "Redmi 12 5G (6000mAh Battery, 50MP Camera)": after the
 * phone's name the spec sheet is dropped, so RAM, SIM, battery and camera words do not turn a phone into a part.
 * Memory sizes, 5G, "dual SIM", "triple camera" and the like always go; "6000mAh battery", "50MP camera" and "nano SIM"
 * only when other specs keep them company (alone they may be a real battery or SIM for sale).
 */
function stripListingSpecs(tokens: string[]): string[] {
  const anchor = tokens.findIndex((word, at) => (PHONE_WORDS.has(word) && !(word === "galaxy" && tokens[at + 1] === "book")) || (SAMSUNG_MODEL.test(word) && tokens.includes("samsung")));
  if (anchor < 0) return tokens;
  const sure = new Set<number>();
  const maybe: number[][] = [];
  const simSpec = (at: number) => tokens[at] === "sim" && !SIM_PART.has(tokens[at + 1] ?? "") && !(tokens[at + 1] === "card" && SIM_PART.has(tokens[at + 2] ?? ""));
  const isCamera = (at: number) => tokens[at] === "camera" || tokens[at] === "cam";
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    // These read the same wherever they sit in the name.
    if (/^(dual|single|hybrid)$/.test(word) && simSpec(i + 1)) {
      sure.add(i);
      sure.add(i + 1);
    } else if (/^(triple|quad|dual|ai)$/.test(word) && isCamera(i + 1)) {
      sure.add(i);
      sure.add(i + 1);
    } else if ((word === "included" || word === "inclusive") && BUNDLED.has(tokens[i - 1] ?? "")) {
      // "33W charger included": the extra in the box.
      sure.add(i);
      sure.add(i - 1);
      if (tokens[i - 2] === "watt") sure.add(i - 2);
    } else if (i > anchor) {
      if (LISTING_SPEC.test(word)) {
        sure.add(i);
        if ((word === "gb" || word === "tb") && i - 1 > anchor && /^\d+$/.test(tokens[i - 1])) sure.add(i - 1);
        if (/mp$/.test(word) && isCamera(i + 1)) maybe.push([i + 1]);
      } else if (word === "mah") {
        maybe.push(tokens[i + 1] === "battery" ? [i, i + 1] : [i]);
      } else if (/^(nano|micro)$/.test(word) && simSpec(i + 1)) {
        maybe.push([i, i + 1]);
      } else if (word === "esim") {
        maybe.push([i]);
      }
    }
  }
  if (sure.size || maybe.length > 1) for (const group of maybe) for (const at of group) sure.add(at);
  return sure.size ? tokens.filter((_, at) => !sure.has(at)) : tokens;
}

function wordsOf(text: string): string[] {
  const tokens = stripListingSpecs(nameWords(text));
  return tokens.some((word) => LAPTOP_MODELS.has(word)) ? [...tokens, "laptop"] : tokens;
}

const PARTISH = [...PART_WORDS, ...ACCESSORY_WORDS].filter((word) => word.length >= 6);
const typoOfPart = new Map<string, boolean>();

/** A word the catalog does not know that is a slip of a part or accessory word: "batry", "baterry", "displey". */
function looksLikePart(word: string): boolean {
  const known = typoOfPart.get(word);
  if (known !== undefined) return known;
  const found = word.length >= 5 && /^\p{L}+$/u.test(word) && !vocab.has(word) && !NO_FUZZY.has(word) && !PART_WORDS.has(word) && !ACCESSORY_WORDS.has(word)
    && PARTISH.some((part) => part[0] === word[0] && Math.abs(part.length - word.length) <= 2 && sameEnding(word, part) && editDistance(word, part, part.length >= 7 ? 2 : 1) <= (part.length >= 7 ? 2 : 1));
  if (typoOfPart.size > 20000) typoOfPart.clear();
  typoOfPart.set(word, found);
  return found;
}

function analyze(input: CatalogInput): Analysis {
  const nameTokens = wordsOf(input.name ?? "");
  const categoryTokens = tokenize(input.category ?? "");
  const nameSet = new Set(nameTokens);
  const found = gather(nameTokens, { fuzzy: true, compact: true });
  const categoryFound = categoryTokens.length ? gather(categoryTokens, { fuzzy: false, compact: false }) : new Map<number, Evidence>();
  const mentions = deviceMentions(found);
  const families = familiesOf(mentions);
  const categoryFamilies = familiesOf(deviceMentions(categoryFound));
  // The name decides the device; the category only speaks when the name names none. A device word the item's own
  // keywords use ("camera" for a camera module, "ipad" for an iPad case) is no reason to refuse that item.
  const contextFor = (index: number): Set<string> => {
    const own = rules[index].words;
    const context = familiesOf(mentions.filter((mention) => ![...mention.words].every((word) => own.has(word))));
    if (context.size) return context;
    if (!families.size && nameTokens.some((word) => PHONE_BRANDS.has(word))) return new Set(["phone"]);
    return families.size ? context : categoryFamilies;
  };
  // The thing for sale is usually the last word ("PS4 controller charging cable" is a cable), ignoring a model number on the end.
  let head = nameTokens.length - 1;
  while (head > 0 && /\d/.test(nameTokens[head])) head--;
  const specNoise = (families.has("laptop") || families.has("computer")) && nameTokens.some((word) => SPEC_WORD.test(word));

  const candidates = new Map<number, { evidence: Evidence; score: number; reason: CatalogMatchReason }>();
  for (const [index, evidence] of found) {
    const entry = CATALOG[index];
    if (excluded(index, nameTokens, nameSet)) continue;
    const mine = rules[index].devices;
    const context = contextFor(index);
    if (entry.tier > 1 && mine.size && context.size && !overlaps(mine, context)) continue;
    if (specNoise && entry.tier === 3 && SPEC_GROUPS.has(entry.group) && evidence.ref.tokens.filter((word) => !SPEC_WORD.test(word)).length <= 1) continue;
    // Tier first, then how many words the keyword explains, then how exactly it matched, then the small things.
    let score = entry.tier * 100000 + Math.min(evidence.n, 9) * 1000 + evidence.kind * 100 - evidence.cost * 10;
    if (evidence.end === head) score += 30;
    if (mine.size && families.size && overlaps(mine, families)) score += 20;
    // With no device mentioned at all, a plain accessory beats a part made for one device ("Speaker" is a speaker, not a phone's).
    if (mine.size && !families.size && !context.size) score -= 5;
    if (categoryFound.has(index)) score += 10;
    candidates.set(index, { evidence, score, reason: KIND_REASON[evidence.kind] });
  }

  // A broader picture whose words sit inside a longer phrase of a whole-device keyword is part of that phrase:
  // the "cpu" in "cpu cabinet" is the computer, not the processor.
  for (const [index, candidate] of [...candidates]) {
    const mine = new Set(candidate.evidence.ref.tokens);
    for (const [other, theirs] of candidates) {
      if (CATALOG[other].tier >= CATALOG[index].tier || theirs.evidence.n <= candidate.evidence.n) continue;
      if (mine.size < theirs.evidence.ref.tokens.length && [...mine].every((word) => theirs.evidence.ref.tokens.includes(word))) { candidates.delete(index); break; }
    }
  }

  // The words a picture other than a whole device already accounts for ("repair" in "repair glue", "battery" in "laptop battery").
  const consumed = new Set<string>();
  for (const [index, { evidence }] of candidates) if (CATALOG[index].tier > 1) for (const word of evidence.ref.tokens) consumed.add(word);

  // Service: work done on a thing, unless the item itself says repair.
  const sellable = nameTokens.some((word) => SELLABLE_WORDS.has(word)) || categoryTokens.some((word) => SELLABLE_WORDS.has(word));
  const nameService = nameTokens.some((word) => SERVICE_WORDS.has(word) && !consumed.has(word));
  const categoryService = categoryTokens.some((word) => word === "service" || word === "labour" || word === "labor" || word === "diagnostic") || (categoryTokens.length === 1 && categoryTokens[0] === "repair");
  const service = !sellable && (nameService || categoryService);
  const repairish = nameTokens.some((word) => REPAIR_WORDS.has(word) && !consumed.has(word)) || (categoryTokens.length === 1 && categoryTokens[0] === "repair");

  // The category alone may pick a picture only when the name matched nothing, and never a laptop, watch, headphones or camera.
  // "Phone parts" and "Mobile accessories" are not phones.
  const partsCategory = categoryTokens.some((word) => PART_WORDS.has(word) || NOT_THE_DEVICE.has(word));
  for (const [index, evidence] of categoryFound) {
    if (candidates.has(index)) continue;
    const entry = CATALOG[index];
    if (evidence.kind < TOKENS || (entry.tier === 1 && partsCategory)) continue;
    if (NAME_ONLY_DEVICES.has(entry.key) || excluded(index, nameTokens, nameSet)) continue;
    const mine = rules[index].devices;
    if (entry.tier > 1 && mine.size && families.size && !overlaps(mine, families)) continue;
    candidates.set(index, { evidence, score: 5000 + entry.tier * 100 + Math.min(evidence.n, 9) * 10, reason: "category" });
  }

  // A phone brand and model on its own ("Redmi Note 12", "Samsung A54") is a phone, but only when nothing else matched.
  if (!candidates.size && PHONE_REF && (nameTokens.some((word) => PHONE_BRANDS.has(word)) || (nameSet.has("samsung") && nameTokens.some((word) => SAMSUNG_MODEL.test(word))))) {
    candidates.set(PHONE, { evidence: { ref: PHONE_REF, kind: FUZZY, n: 1, cost: 0, end: -1 }, score: 50000, reason: "brand" });
  }

  // A whole-device picture never stands in for a part of that device ("lcd" in "LCD TV" is the device's own name).
  const named = new Set(consumed);
  for (const [, { evidence }] of candidates) for (const word of evidence.ref.tokens) named.add(word);
  const loosePart = nameTokens.filter((word) => (PART_WORDS.has(word) || ACCESSORY_WORDS.has(word) || looksLikePart(word)) && !named.has(word));
  if (!service) {
    for (const [index] of [...candidates]) if (CATALOG[index].tier === 1 && loosePart.some((word) => !rules[index].words.has(word))) candidates.delete(index);
  }

  const list: CatalogMatch[] = [...candidates]
    .sort((a, b) => b[1].score - a[1].score || a[0] - b[0])
    .map(([index, candidate]) => ({ entry: CATALOG[index], score: candidate.score, reason: candidate.reason, keyword: candidate.evidence.ref.keyword }));

  if (service) {
    const top = list.find((match) => match.entry.tier > 1);
    const resists = top && SERVICE_PROOF_GROUPS.has(top.entry.group) && top.reason !== "category";
    if (!resists) {
      const device = list.find((match) => match.entry.tier === 1);
      if (device) list.unshift({ ...device, score: 1_000_000, reason: "service" });
      else if (repairish && REPAIR_TOOLS >= 0) list.unshift({ entry: CATALOG[REPAIR_TOOLS], score: 1_000_000, reason: "service", keyword: "repair" });
    }
  }
  return { list, service };
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

const cache = new Map<string, Analysis>();

function analysisFor(input: CatalogInput): Analysis {
  const key = `${input.name}\u0000${input.category ?? ""}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = analyze(input);
  if (cache.size >= 5000) cache.clear();
  cache.set(key, result);
  return result;
}

/** The catalog pictures a product could have, best first. */
export function matchCatalog(input: CatalogInput, limit = 5): CatalogMatch[] {
  return analysisFor(input).list.slice(0, Math.max(0, limit));
}

/**
 * The one picture to show, or null when we are not sure: an unknown or vague name ("Misc item",
 * "Gift", "Service charge") gets the normal placeholder, never a wrong picture. Two equally good
 * pictures also count as not sure.
 */
export function bestCatalogMatch(input: CatalogInput): CatalogEntry | null {
  const [top, second] = analysisFor(input).list;
  if (!top) return null;
  if (second && second.score === top.score && second.entry.key !== top.entry.key) return null;
  return top.entry;
}

/** True when the name is work on a thing ("TV repair", "labour"), not a thing for sale. */
export function isServiceName(input: CatalogInput): boolean {
  return analysisFor(input).service;
}

/** True when the name has a part word ("battery", "flex", "board"): such a name is never a whole device. */
export function hasPartWord(name: string): boolean {
  return tokenize(name).some((word) => PART_WORDS.has(word));
}

export function catalogEntryByKey(key: string | null | undefined): CatalogEntry | null {
  if (!key) return null;
  const index = entryIndex.get(key.trim());
  return index === undefined ? null : CATALOG[index];
}

/**
 * The whole-device picture for free text such as "Laptop Dell XPS 13" or "Galaxy Watch 6": the repair
 * card's asset type and model. Looks at the device entries only.
 */
export function bestDeviceEntry(text: string): CatalogEntry | null {
  const found = gather(wordsOf(text), { fuzzy: true, compact: true });
  let best: [number, Evidence] | null = null;
  for (const item of found) {
    if (!isDeviceEntry(item[0])) continue;
    if (!best || item[1].n > best[1].n || (item[1].n === best[1].n && (item[1].kind > best[1].kind || (item[1].kind === best[1].kind && item[0] < best[0])))) best = item;
  }
  return best ? CATALOG[best[0]] : null;
}

// ---------------------------------------------------------------------------------------------
// Picker: search box and tabs
// ---------------------------------------------------------------------------------------------

type Searchable = { label: string; labelWords: string[]; keywords: { text: string; words: string[] }[] };
const searchable: Searchable[] = CATALOG.map((entry) => {
  const label = clean(entry.label);
  return { label, labelWords: label.split(" "), keywords: entry.keywords.map((keyword) => { const text = clean(keyword); return { text, words: text.split(" ") }; }) };
});

/** Every typed word starts a different word of the text ("gla gua" finds "glass guard"). */
function wordsPrefix(query: string[], words: string[]) {
  const used = new Set<number>();
  return query.every((part) => {
    const at = words.findIndex((word, i) => !used.has(i) && word.startsWith(part));
    if (at < 0) return false;
    used.add(at);
    return true;
  });
}

/**
 * What the picker's search box shows, best first: the picture whose label is what was typed, then one with
 * that exact word as another name ("tv" finds Television), then label hits (prefix, word prefixes, anywhere),
 * then keyword hits, then the matcher's best guesses so a typo still finds something.
 */
export function catalogSearch(query: string, limit = 24): CatalogEntry[] {
  const plain = clean(query);
  if (!plain) return [];
  const forms = [...new Set([plain, normalize(query)])];
  const scored: [number, number][] = [];
  searchable.forEach((item, index) => {
    let best = 0;
    for (const form of forms) {
      const words = form.split(" ");
      if (item.label === form) best = Math.max(best, 1200);
      else if (item.keywords.some((keyword) => keyword.text === form)) best = Math.max(best, 1100);
      else if (item.label.startsWith(form)) best = Math.max(best, 1000);
      else if (wordsPrefix(words, item.labelWords)) best = Math.max(best, 900);
      else if (item.label.includes(form)) best = Math.max(best, 800);
      if (best >= 800) continue;
      for (const keyword of item.keywords) {
        const score = keyword.text.startsWith(form) ? 600 : wordsPrefix(words, keyword.words) ? 500 : keyword.text.includes(form) ? 400 : 0;
        if (score) best = Math.max(best, score - Math.min(keyword.text.length, 60) / 100);
      }
    }
    if (best > 0) scored.push([index, best]);
  });
  // Equally good hits: the shorter label first ("Laptop" before "Laptop sleeve"), then the catalog's own order.
  scored.sort((a, b) => b[1] - a[1] || CATALOG[a[0]].label.length - CATALOG[b[0]].label.length || a[0] - b[0]);
  const out = scored.map(([index]) => CATALOG[index]);
  if (out.length < limit) {
    for (const match of matchCatalog({ name: query }, limit)) if (!out.includes(match.entry)) out.push(match.entry);
  }
  return out.slice(0, Math.max(0, limit));
}

/** The groups in tab order, with how many pictures each holds. */
export const CATALOG_GROUPS: CatalogGroup[] = (() => {
  const count = new Map<string, number>();
  for (const entry of CATALOG) count.set(entry.group, (count.get(entry.group) ?? 0) + 1);
  const ordered: string[] = [...CATALOG_GROUP_ORDER];
  for (const name of count.keys()) if (!ordered.includes(name)) ordered.push(name);
  return ordered.filter((name) => count.has(name)).map((name) => ({ name, count: count.get(name) ?? 0 }));
})();
