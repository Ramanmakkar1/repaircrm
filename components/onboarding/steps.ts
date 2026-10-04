/**
 * The onboarding wizard's shape and progress rules.
 *
 * Pure — imported by the wizard (client), the setup actions (server) and the
 * dashboard checklist (server), so this file must stay free of `db`,
 * `next/*` and "use server".
 */

import type { Prisma } from "@prisma/client";

export const STEPS = [
  {
    key: "shop",
    title: "Your shop",
    blurb: "The name, address and sales tax that go on every receipt.",
    photo: "/images/home/cash-register.webp",
  },
  {
    key: "team",
    title: "Your team",
    blurb: "The people who will use Repairs helper with you.",
    photo: "/images/home/customers-cards.webp",
  },
  {
    key: "payments",
    title: "Getting paid",
    blurb: "Cash works today. Card payments when you are ready.",
    photo: "/images/home/card-terminal.webp",
  },
  {
    key: "items",
    title: "Your first items",
    blurb: "Two or three of the jobs and parts you sell most.",
    photo: "/images/home/price-tag.webp",
  },
  {
    key: "ready",
    title: "Ready",
    blurb: "Three things worth doing before your first customer.",
    photo: "/images/home/pickup-bag.webp",
  },
] as const;

/** "Step 2 of 5: Your team", the words the progress bar says. */
export function stepWords(key: StepKey): string {
  const index = STEP_KEYS.indexOf(key);
  return `Step ${index + 1} of ${STEP_KEYS.length}: ${STEPS[index].title}`;
}

/** How far through, 0-100, for the progress bar: done or skipped steps count, plus where you are. */
export function stepProgress(key: StepKey, done: ReadonlySet<StepKey>): number {
  const passed = new Set([...done]);
  passed.add(key);
  const at = STEP_KEYS.indexOf(key) + 1;
  return Math.round((Math.max(at, passed.size) / STEP_KEYS.length) * 100);
}

/** One word for a step's state on the step list. */
export function stepState(key: StepKey, current: StepKey, completed: ReadonlySet<StepKey>, skipped: ReadonlySet<StepKey>): "Now" | "Done" | "Later" | "" {
  if (key === current) return "Now";
  if (completed.has(key)) return "Done";
  if (skipped.has(key)) return "Later";
  return "";
}

export type StepKey = (typeof STEPS)[number]["key"];

export const STEP_KEYS: readonly StepKey[] = STEPS.map((step) => step.key);

export function isStepKey(value: unknown): value is StepKey {
  return (STEP_KEYS as readonly string[]).includes(value as string);
}

/**
 * What lives in `Shop.settings.onboarding`.
 *
 * Deliberately additive lists rather than an index: an operator who goes back
 * to a finished step and reopens it should not lose the four steps after it,
 * and a step added to the wizard in a later release must not make a shop's
 * stored progress meaningless.
 */
export type OnboardingState = {
  /** Steps whose primary action was completed. */
  completed?: StepKey[];
  /** Steps the operator pressed "Do this later" on. */
  skipped?: StepKey[];
  /** Where they were last, so a reload resumes rather than restarts. */
  current?: StepKey;
  /** Stamped by "Finish". */
  finishedAt?: string;
  /** The dashboard checklist card was dismissed for this shop. */
  dismissed?: boolean;
};

/** Reads `Shop.settings.onboarding`, tolerating every shape the column holds. */
export function readOnboarding(
  settings: Prisma.JsonValue | null | undefined,
): OnboardingState {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const value = (settings as Record<string, unknown>).onboarding;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const state = value as OnboardingState;
  return {
    completed: cleanKeys(state.completed),
    skipped: cleanKeys(state.skipped),
    current: isStepKey(state.current) ? state.current : undefined,
    finishedAt: typeof state.finishedAt === "string" ? state.finishedAt : undefined,
    dismissed: state.dismissed === true,
  };
}

function cleanKeys(value: unknown): StepKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isStepKey);
}

/**
 * Where to resume.
 *
 * The stored `current` wins — it is where the operator actually was, including
 * a step they went back to. Failing that, the first step neither completed nor
 * skipped; failing that, the last step, which is the summary and always worth
 * landing on.
 */
export function resumeStep(state: OnboardingState): StepKey {
  if (state.current && isStepKey(state.current)) return state.current;
  const done = new Set([...(state.completed ?? []), ...(state.skipped ?? [])]);
  return STEP_KEYS.find((key) => !done.has(key)) ?? STEP_KEYS[STEP_KEYS.length - 1];
}

export function stepIndex(key: StepKey): number {
  return STEP_KEYS.indexOf(key);
}
