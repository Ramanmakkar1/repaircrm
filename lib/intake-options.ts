/**
 * The boxes the New repair check-in offers, and how a shop changes them.
 *
 * Two lists live in Shop.settings (a Json column: no migration):
 *
 *   deviceKinds     [{ id, label, type, image, hidden? }]  step 2, "What are we fixing?"
 *   problemPictures { "<problem name>": "<catalog key>" }   step 3, "What's wrong?"
 *
 * The problem list itself stays settings.problemTypes (string[]), untouched in
 * shape, so the portal, the public check-in, the API and Full mode keep reading
 * plain words.
 *
 * Everything here is pure (no React, no database, no next/*) so the server
 * action, the settings editor, the check-in and the tests all use the same rules.
 * It reads the picture library in lib/catalog, which is browser-safe.
 */

import { bestCatalogMatch, catalogEntryByKey, catalogSearch, matchCatalog } from "@/lib/catalog/match";
import type { CatalogEntry } from "@/lib/catalog/types";
import { INTAKE_DEVICE_KINDS, INTAKE_OTHER_TYPE } from "@/lib/device-intake";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Device boxes, "Other" included. */
export const MAX_DEVICE_KINDS = 24;
/**
 * What the check-in's first screen holds: eight boxes are two rows on a 1024x768 tablet, so nothing
 * needs a scroll. With more than eight, seven kinds show and the eighth box is "More devices".
 */
export const FIRST_SCREEN_BOXES = 8;
/** What a device box says. Short enough for a tile; the repair is saved with `type`, which may be longer. */
export const MAX_KIND_LABEL = 30;
export const MAX_KIND_TYPE = 80;
/** Problem boxes. The same limits the problem-type list has always had. */
export const MAX_PROBLEMS = 40;
export const MAX_PROBLEM_LENGTH = 60;

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export type DeviceKind = {
  /** Stable slug. Never changes when the box is renamed. */
  id: string;
  /** What the tile says. */
  label: string;
  /** What the repair is saved with. The built-ins keep their original values so existing data and Full mode stay consistent. */
  type: string;
  /** A picture key from lib/catalog, or "" for the neutral icon. */
  image: string;
  hidden?: boolean;
};

export const OTHER_KIND_ID = "other";

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

/** The eight kinds the check-in has always had, then the ones a repair shop meets daily, then Other. */
const EXTRA_KINDS: Omit<DeviceKind, "id">[] = [
  { label: "Handheld console", type: "Handheld console", image: "handheld-console" },
  { label: "Headphones", type: "Headphones", image: "headphones" },
  { label: "Camera", type: "Camera", image: "camera" },
  { label: "Drone", type: "Drone", image: "drone" },
  { label: "Printer", type: "Printer", image: "printer" },
];

export const DEFAULT_DEVICE_KINDS: readonly DeviceKind[] = (() => {
  const original = INTAKE_DEVICE_KINDS.filter((kind) => kind.type !== INTAKE_OTHER_TYPE).map((kind) => ({
    id: slug(kind.label),
    label: kind.label as string,
    type: kind.type as string,
    image: kind.photo as string,
  }));
  const extra = EXTRA_KINDS.map((kind) => ({ ...kind, id: slug(kind.label) }));
  const other = INTAKE_DEVICE_KINDS.find((kind) => kind.type === INTAKE_OTHER_TYPE);
  return Object.freeze([
    ...original,
    ...extra,
    { id: OTHER_KIND_ID, label: (other?.label ?? "Other") as string, type: INTAKE_OTHER_TYPE, image: (other?.photo ?? "repair-tools") as string },
  ]);
})();

const BUILT_IN = new Map(DEFAULT_DEVICE_KINDS.map((kind) => [kind.id, kind]));

/** True for a box that ships with the app: its type is fixed and it can be hidden but not removed. */
export function isBuiltInKind(id: string): boolean {
  return BUILT_IN.has(id);
}

export const isOtherKind = (kind: Pick<DeviceKind, "id">) => kind.id === OTHER_KIND_ID;

/** Trim, drop control characters, collapse runs of spaces. */
export function tidy(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);

/** A picture key that exists in the library, else "". */
export function knownImageKey(value: unknown): string {
  return typeof value === "string" && catalogEntryByKey(value) ? value.trim() : "";
}

/** The picture a box shows, or null for the neutral icon. */
export function kindPicture(kind: Pick<DeviceKind, "image">): CatalogEntry | null {
  return catalogEntryByKey(kind.image);
}

function uniqueId(base: string, taken: Set<string>): string {
  const start = base || "device";
  if (!taken.has(start)) return start;
  for (let n = 2; ; n++) {
    const next = `${start.slice(0, 36)}-${n}`;
    if (!taken.has(next)) return next;
  }
}

/**
 * Whatever was stored (or sent), made into a list the check-in can trust: blanks, duplicates
 * (same name or same saved type, ignoring case), unknown picture keys and everything past the
 * limit are dropped, the built-ins keep their types, and "Other" is last and never hidden.
 * Never throws.
 */
export function cleanDeviceKinds(raw: unknown, cap = MAX_DEVICE_KINDS): DeviceKind[] {
  const items = Array.isArray(raw) ? raw : [];
  const labels: string[] = [];
  const types: string[] = [];
  const ids = new Set<string>();
  const kept: DeviceKind[] = [];
  let other: DeviceKind | null = null;

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const wantedId = validId(row.id) ? row.id : "";
    const builtIn = wantedId ? BUILT_IN.get(wantedId) : undefined;
    const label = tidy(row.label).slice(0, MAX_KIND_LABEL) || builtIn?.label || "";
    if (!label) continue;

    const rawType = tidy(row.type).slice(0, MAX_KIND_TYPE);
    const isOther = wantedId === OTHER_KIND_ID || (!builtIn && same(rawType || label, INTAKE_OTHER_TYPE));
    if (isOther) {
      if (!other) other = { id: OTHER_KIND_ID, label, type: INTAKE_OTHER_TYPE, image: knownImageKey(row.image) || builtIn?.image || "repair-tools" };
      continue;
    }

    const type = builtIn ? builtIn.type : rawType || label;
    if (labels.some((seen) => same(seen, label)) || types.some((seen) => same(seen, type))) continue;
    labels.push(label);
    types.push(type);

    const id = uniqueId(wantedId || slug(label), ids);
    ids.add(id);
    // A picture that is not in the library is dropped; a built-in then gets its own picture back, a custom box the neutral icon.
    const image = knownImageKey(row.image) || (row.image === "" ? "" : (builtIn?.image ?? ""));
    kept.push({ id, label, type, image, ...(row.hidden === true ? { hidden: true } : {}) });
  }

  // Other is always last, always visible, always there. A name that clashes with another box falls back to "Other".
  const fallback = DEFAULT_DEVICE_KINDS[DEFAULT_DEVICE_KINDS.length - 1];
  const closing = other ?? { ...fallback };
  if (labels.some((seen) => same(seen, closing.label))) closing.label = fallback.label;
  return [...kept.slice(0, cap - 1), closing];
}

/** The list the shop has chosen, or the standard one when it never did. */
export function deviceKindsFor(settings: unknown): DeviceKind[] {
  const raw = settingsValue(settings, "deviceKinds");
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind }));
  const cleaned = cleanDeviceKinds(raw);
  return cleaned.length > 1 ? cleaned : DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind }));
}

/** What the check-in tiles show: hidden boxes skipped, Other still last. */
export function visibleDeviceKinds(kinds: readonly DeviceKind[]): DeviceKind[] {
  return kinds.filter((kind) => !kind.hidden || isOtherKind(kind));
}

/**
 * Checks a list a person sent, in words, then cleans it. Strict where cleanDeviceKinds is lenient:
 * a list that is too long or a name that is too long is refused rather than quietly cut.
 */
export function checkDeviceKinds(raw: unknown): { ok: true; kinds: DeviceKind[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "That list of devices could not be read. Reload the page and try again." };
  for (const item of raw) {
    const label = item && typeof item === "object" ? tidy((item as Record<string, unknown>).label) : "";
    if (label.length > MAX_KIND_LABEL) return { ok: false, error: `“${label.slice(0, 20)}…” is too long. Keep a device name to ${MAX_KIND_LABEL} letters or fewer.` };
  }
  if (cleanDeviceKinds(raw, Number.POSITIVE_INFINITY).length > MAX_DEVICE_KINDS) {
    return { ok: false, error: `You can have up to ${MAX_DEVICE_KINDS} devices. Hide or remove one first.` };
  }
  return { ok: true, kinds: cleanDeviceKinds(raw) };
}

/** In words, why this name cannot be used for a device box, or "" when it can. `exceptId` is the box being renamed. */
export function deviceNameIssue(kinds: readonly DeviceKind[], name: string, exceptId?: string): string {
  const label = tidy(name);
  if (!label) return "Type a name first.";
  if (label.length > MAX_KIND_LABEL) return `Keep the name to ${MAX_KIND_LABEL} letters or fewer.`;
  const clash = kinds.find((kind) => kind.id !== exceptId && (same(kind.label, label) || same(kind.type, label)));
  if (clash) return `You already have a box called “${clash.label}”.`;
  if (same(label, INTAKE_OTHER_TYPE) && exceptId !== OTHER_KIND_ID) return "“Other” is always there, at the end.";
  return "";
}

export type ListResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A new custom box goes just before "Other". Its type is its name. */
export function addDeviceKind(kinds: readonly DeviceKind[], input: { label: string; image?: string }): ListResult<DeviceKind[]> {
  const issue = deviceNameIssue(kinds, input.label);
  if (issue) return { ok: false, error: issue };
  if (kinds.length >= MAX_DEVICE_KINDS) return { ok: false, error: `You can have up to ${MAX_DEVICE_KINDS} devices. Hide or remove one first.` };
  const label = tidy(input.label);
  const id = uniqueId(slug(label), new Set(kinds.map((kind) => kind.id)));
  const added: DeviceKind = { id, label, type: label, image: knownImageKey(input.image) };
  const rest = kinds.filter((kind) => !isOtherKind(kind));
  const other = kinds.filter(isOtherKind);
  return { ok: true, value: [...rest, added, ...other] };
}

/** Rename and/or re-picture one box. A custom box's saved type follows its name; a built-in's never changes. */
export function updateDeviceKind(
  kinds: readonly DeviceKind[],
  id: string,
  patch: { label?: string; image?: string },
): ListResult<DeviceKind[]> {
  const current = kinds.find((kind) => kind.id === id);
  if (!current) return { ok: false, error: "That device is no longer in the list." };
  let next: DeviceKind = { ...current };
  if (patch.label !== undefined && tidy(patch.label) !== current.label) {
    const issue = deviceNameIssue(kinds, patch.label, id);
    if (issue) return { ok: false, error: issue };
    next = { ...next, label: tidy(patch.label), type: isBuiltInKind(id) ? current.type : tidy(patch.label) };
  }
  if (patch.image !== undefined) next = { ...next, image: knownImageKey(patch.image) };
  return { ok: true, value: kinds.map((kind) => (kind.id === id ? next : kind)) };
}

/** Hide or show a box. "Other" cannot be hidden. */
export function setDeviceHidden(kinds: readonly DeviceKind[], id: string, hidden: boolean): DeviceKind[] {
  return kinds.map((kind) => {
    if (kind.id !== id || isOtherKind(kind)) return kind;
    return { id: kind.id, label: kind.label, type: kind.type, image: kind.image, ...(hidden ? { hidden: true } : {}) };
  });
}

/** Take a custom box off the list. Built-ins and "Other" stay (hide a built-in instead). Repairs already saved are untouched. */
export function removeDeviceKind(kinds: readonly DeviceKind[], id: string): DeviceKind[] {
  return kinds.filter((kind) => kind.id !== id || isBuiltInKind(kind.id));
}

/** Move one box a place earlier (-1) or later (+1). "Other" stays last and nothing moves past it. */
export function moveDeviceKind(kinds: readonly DeviceKind[], id: string, step: -1 | 1): DeviceKind[] {
  return moveWithin(kinds, kinds.findIndex((kind) => kind.id === id), step, kinds.filter((kind) => !isOtherKind(kind)).length);
}

/** True when the box can go one place earlier / later. */
export function canMoveDevice(kinds: readonly DeviceKind[], id: string, step: -1 | 1): boolean {
  const at = kinds.findIndex((kind) => kind.id === id);
  const movable = kinds.filter((kind) => !isOtherKind(kind)).length;
  if (at < 0 || isOtherKind(kinds[at])) return false;
  return step === -1 ? at > 0 : at < movable - 1;
}

function moveWithin<T>(items: readonly T[], at: number, step: -1 | 1, limit: number): T[] {
  const to = at + step;
  if (at < 0 || to < 0 || to >= limit || at >= limit) return [...items];
  const out = [...items];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

/**
 * The problem list: trim, collapse spaces, drop blanks, ignore case when looking for duplicates,
 * cap the size. The order is the owner's.
 */
export function cleanProblemTypes(values: unknown, cap = MAX_PROBLEMS): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = tidy(raw).slice(0, MAX_PROBLEM_LENGTH).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= cap) break;
  }
  return out;
}

/** Checks a problem list a person sent, in words, then cleans it: too long a name or too long a list is refused, not quietly cut. */
export function checkProblemTypes(raw: unknown): { ok: true; problems: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "That list of problems could not be read. Reload the page and try again." };
  for (const item of raw) {
    const name = tidy(item);
    if (name.length > MAX_PROBLEM_LENGTH) return { ok: false, error: `“${name.slice(0, 20)}…” is too long. Keep a problem name to ${MAX_PROBLEM_LENGTH} letters or fewer.` };
  }
  const problems = cleanProblemTypes(raw, Number.POSITIVE_INFINITY);
  if (problems.length === 0) return { ok: false, error: "Keep at least one problem." };
  if (problems.length > MAX_PROBLEMS) return { ok: false, error: `You can have up to ${MAX_PROBLEMS} problems. Remove one first.` };
  return { ok: true, problems };
}

/** In words, why this name cannot be used for a problem box, or "" when it can. `except` is the one being renamed. */
export function problemNameIssue(problems: readonly string[], name: string, except?: string): string {
  const label = tidy(name);
  if (!label) return "Type a name first.";
  if (label.length > MAX_PROBLEM_LENGTH) return `Keep the name to ${MAX_PROBLEM_LENGTH} letters or fewer.`;
  const clash = problems.find((problem) => (except === undefined || !same(problem, except)) && same(problem, label));
  if (clash) return `You already have a box called “${clash}”.`;
  return "";
}

/** Pictures for problems, keyed by the problem's own spelling. A key not in the library, or a problem not in the list, is dropped. */
export function cleanProblemPictures(raw: unknown, problems: readonly string[]): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const asked = new Map<string, string>();
  for (const [name, key] of Object.entries(raw as Record<string, unknown>)) {
    const image = knownImageKey(key);
    if (image) asked.set(tidy(name).toLowerCase(), image);
  }
  const out: [string, string][] = [];
  for (const problem of problems) {
    const image = asked.get(problem.toLowerCase());
    if (image) out.push([problem, image]);
  }
  return Object.fromEntries(out);
}

/** The pictures the shop chose for its problems. */
export function problemPicturesFor(settings: unknown, problems?: readonly string[]): Record<string, string> {
  const raw = settingsValue(settings, "problemPictures");
  const list = problems ?? cleanProblemTypes(settingsValue(settings, "problemTypes"));
  return cleanProblemPictures(raw, list);
}

/** A problem box: change its name (its picture follows) and/or its picture. `image` "" clears the picture. */
export function updateProblem(
  state: { problems: readonly string[]; pictures: Record<string, string> },
  from: string,
  patch: { name?: string; image?: string },
): ListResult<{ problems: string[]; pictures: Record<string, string> }> {
  const at = state.problems.findIndex((problem) => problem === from);
  if (at < 0) return { ok: false, error: "That problem is no longer in the list." };
  let name = from;
  if (patch.name !== undefined && tidy(patch.name) !== from) {
    const issue = problemNameIssue(state.problems, patch.name, from);
    if (issue) return { ok: false, error: issue };
    name = tidy(patch.name);
  }
  const pictures = { ...state.pictures };
  const image = patch.image !== undefined ? knownImageKey(patch.image) : (pictures[from] ?? "");
  delete pictures[from];
  if (image) pictures[name] = image;
  return { ok: true, value: { problems: state.problems.map((problem, index) => (index === at ? name : problem)), pictures } };
}

/** Add a problem at the end. */
export function addProblem(
  state: { problems: readonly string[]; pictures: Record<string, string> },
  input: { name: string; image?: string },
): ListResult<{ problems: string[]; pictures: Record<string, string> }> {
  const issue = problemNameIssue(state.problems, input.name);
  if (issue) return { ok: false, error: issue };
  if (state.problems.length >= MAX_PROBLEMS) return { ok: false, error: `You can have up to ${MAX_PROBLEMS} problems. Remove one first.` };
  const name = tidy(input.name);
  const image = knownImageKey(input.image);
  return { ok: true, value: { problems: [...state.problems, name], pictures: image ? { ...state.pictures, [name]: image } : { ...state.pictures } } };
}

/** Take a problem off the list (and its picture). Repairs that used it keep their wording. At least one must stay. */
export function removeProblem(
  state: { problems: readonly string[]; pictures: Record<string, string> },
  name: string,
): ListResult<{ problems: string[]; pictures: Record<string, string> }> {
  if (state.problems.length <= 1) return { ok: false, error: "Keep at least one problem." };
  const pictures = { ...state.pictures };
  delete pictures[name];
  return { ok: true, value: { problems: state.problems.filter((problem) => problem !== name), pictures } };
}

// ---------------------------------------------------------------------------
// Checklists follow a problem by its name
// ---------------------------------------------------------------------------

/**
 * A checklist (ChecklistTemplate) is tied to a problem by its exact NAME: when a repair is created,
 * the checklist whose `problemType` equals the problem's name is attached. So a problem that is
 * renamed has to take its checklists along, and one that leaves the list leaves its checklists
 * attached to nothing. These helpers say which checklists are affected.
 */
export type ChecklistLink = { name: string; problemType: string | null };

/** A problem renamed from one list spelling to another. */
export type ProblemRename = { from: string; to: string };

/** The checklists that attach to this problem (exact name, as a new repair matches them). */
export function checklistsOn<T extends ChecklistLink>(templates: readonly T[], problem: string): T[] {
  return templates.filter((template) => template.problemType === problem);
}

/** The checklists tied to a problem that is not on `problems`: a new repair can never pick them up. */
export function checklistsWithoutProblem<T extends ChecklistLink>(templates: readonly T[], problems: readonly string[]): T[] {
  const listed = new Set(problems);
  return templates.filter((template) => template.problemType !== null && template.problemType !== "" && !listed.has(template.problemType));
}

/** Which names changed between two lists of the same length (a rename keeps the place): `{ from, to }` for each. */
export function renamesBetween(before: readonly string[], after: readonly string[]): ProblemRename[] {
  if (before.length !== after.length) return [];
  const out: ProblemRename[] = [];
  before.forEach((from, index) => {
    if (from !== after[index]) out.push({ from, to: after[index] });
  });
  return out;
}

/**
 * The renames the server may carry over to checklists, out of what a request said. A rename counts
 * only when it still makes sense against the list that is being saved: the new name is on it and
 * the old one no longer is (so a checklist never leaves a problem that still exists, and nothing
 * can chain or swap). Anything else is ignored, never trusted. Each old name is moved once.
 */
export function cleanProblemRenames(raw: unknown, problems: readonly string[]): ProblemRename[] {
  if (!Array.isArray(raw)) return [];
  const listed = new Set(problems);
  const done = new Set<string>();
  const out: ProblemRename[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { from, to } = item as Record<string, unknown>;
    if (typeof from !== "string" || typeof to !== "string" || !from || !to || from === to) continue;
    if (!listed.has(to) || listed.has(from) || done.has(from)) continue;
    done.add(from);
    out.push({ from, to });
  }
  return out;
}

/** “A”, “A” and “B”, “A”, “B” and “C”, or “4 checklists” when naming them would be a wall of text. */
function checklistSubject(templates: readonly ChecklistLink[]): string {
  const names = templates.map((template) => `“${template.name}”`);
  if (names.length === 1) return `The checklist ${names[0]}`;
  if (names.length <= 3) return `The checklists ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.length} checklists`;
}

/** Said when a problem with checklists is about to be renamed (the Edit sheet): they move with it. */
export function renameChecklistNote(templates: readonly ChecklistLink[]): string {
  if (templates.length === 0) return "";
  return `${checklistSubject(templates)} ${templates.length === 1 ? "is" : "are"} tied to this problem and move${templates.length === 1 ? "s" : ""} with it if you rename it.`;
}

/** Said when a problem with checklists is taken off the list: they stop attaching until it comes back. */
export function removeChecklistNote(templates: readonly ChecklistLink[]): string {
  if (templates.length === 0) return "";
  return `${checklistSubject(templates)} will not attach to new repairs now. Undo puts ${templates.length === 1 ? "it" : "them"} back.`;
}

/** Said when the problem list is about to be reset: the checklists whose problem is not in the standard list. */
export function resetChecklistNote(templates: readonly ChecklistLink[]): string {
  if (templates.length === 0) return "";
  const one = templates.length === 1;
  return `${checklistSubject(templates)} ${one ? "stops" : "stop"} attaching to new repairs, because ${one ? "its problem is" : "their problems are"} not in the standard list. You can pick another problem for ${one ? "it" : "them"} under Checklists.`;
}

export function moveProblem(problems: readonly string[], name: string, step: -1 | 1): string[] {
  return moveWithin(problems, problems.indexOf(name), step, problems.length);
}

export function canMoveProblem(problems: readonly string[], name: string, step: -1 | 1): boolean {
  const at = problems.indexOf(name);
  return at >= 0 && (step === -1 ? at > 0 : at < problems.length - 1);
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/**
 * The pictures to offer for a name as it is typed: the best match first, then up to `limit - 1`
 * others, no repeats. Empty when nothing in the library fits (an "e-scooter"), so the screen
 * can say so instead of guessing. Repair-service entries rank last: for a problem such as
 * "Screen Repair" the part (a display) is a better picture than the toolbox.
 */
export function suggestPictures(name: string, limit = 5): CatalogEntry[] {
  const query = tidy(name);
  if (!query || limit <= 0) return [];
  const matches = matchCatalog({ name: query }, 8);
  const strong = matches.filter((match) => match.reason !== "service").map((match) => match.entry);
  const weak = matches.filter((match) => match.reason === "service").map((match) => match.entry);
  const best = bestCatalogMatch({ name: query });
  const ordered = [...(best && !weak.includes(best) ? [best] : []), ...strong, ...catalogSearch(query, 8), ...weak];
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  for (const entry of ordered) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/** The picture key to use for a new box nobody chose a picture for: the best suggestion, or "" (the neutral icon). */
export function defaultPictureKey(name: string): string {
  return suggestPictures(name, 1)[0]?.key ?? "";
}

// ---------------------------------------------------------------------------
// The one save the editor and the check-in use (app/(app)/settings/actions.ts)
// ---------------------------------------------------------------------------

/** Only the keys that are present are changed; the rest of Shop.settings is left alone. */
export type SaveIntakeOptionsInput = {
  /** The whole ordered device list. */
  deviceKinds?: unknown;
  /** The whole ordered problem list. */
  problemTypes?: unknown;
  /** problem name -> picture key. Pictures of problems no longer in the list are dropped. */
  problemPictures?: unknown;
  /** Put a list back to the standard one (and, for problems, forget their pictures). */
  reset?: Array<"devices" | "problems">;
  /** Add one device just before "Other" (the check-in's "Add this to my devices"). With no picture the best suggestion is used. */
  addDevice?: { label: string; image?: string };
  /**
   * Problems renamed in this save, so the checklists tied to the old name move to the new one (in the
   * same transaction as the list). Only renames that match the saved list are honoured, see cleanProblemRenames.
   */
  renamed?: ProblemRename[];
};

export type SaveIntakeOptionsResult =
  | {
      ok: true;
      deviceKinds: DeviceKind[];
      problemTypes: string[];
      problemPictures: Record<string, string>;
      /** How many checklists followed a renamed problem; absent when none did. */
      checklistsMoved?: number;
    }
  | { ok: false; error: string };

export type SaveIntakeOptions = (input: SaveIntakeOptionsInput) => Promise<SaveIntakeOptionsResult>;

// ---------------------------------------------------------------------------
// Settings JSON
// ---------------------------------------------------------------------------

function settingsValue(settings: unknown, key: string): unknown {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>)[key] : undefined;
}
