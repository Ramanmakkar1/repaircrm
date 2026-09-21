import { cookies } from "next/headers";

/**
 * Per-viewer UI preferences: how dense the app is, and whether the rail is
 * collapsed.
 *
 * ---------------------------------------------------------------------------
 * WHY A COOKIE AND NOT localStorage
 * ---------------------------------------------------------------------------
 * These decide what the server renders — a `data-density` attribute on the
 * shell, and whether the rail comes back 60px or 240px wide. Read them in the
 * browser after hydration and every navigation would paint the wrong layout
 * first and then snap, which is exactly the flicker that makes an app feel
 * cheap. A cookie is on the request, so the first byte is already right.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT ON THE USER ROW
 * ---------------------------------------------------------------------------
 * Because it is a property of the SCREEN, not the person. The same tech wants
 * compact on the back-office monitor and comfortable on the counter tablet
 * they share with two colleagues, and a database column would fight them on
 * one device or the other. Per-device is the correct scope, and a cookie is
 * per-device by construction.
 *
 * Anything unreadable falls back to the defaults rather than throwing: a
 * mangled preference cookie must never be able to stop the app rendering.
 */

const UI_COOKIE = "rf_ui";

/** A year — this is a preference, not a session. */
const MAX_AGE = 60 * 60 * 24 * 365;

export type Density = "comfortable" | "compact";
export type Theme = "system" | "light" | "dark";

export interface UiPrefs {
  density: Density;
  theme: Theme;
  /** Rail collapsed to icons only. Desktop only; the mobile drawer ignores it. */
  railCollapsed: boolean;
  /**
   * Simple mode, for the counter tablet and the phone in a pocket: no side
   * menu, and a home screen of a few big cards (/counter) instead of the
   * dashboard. Per-device like the rest — the back-office PC keeps everything.
   */
  simple: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  density: "comfortable",
  theme: "system",
  railCollapsed: false,
  simple: false,
};

function parse(raw: string | undefined): UiPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      density: value.density === "compact" ? "compact" : "comfortable",
      theme:
        value.theme === "dark" || value.theme === "light"
          ? value.theme
          : "system",
      railCollapsed: value.railCollapsed === true,
      simple: value.simple === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function readUiPrefs(): Promise<UiPrefs> {
  const jar = await cookies();
  return parse(jar.get(UI_COOKIE)?.value);
}

/**
 * Persist a change. Called only from the server action in
 * `app/(app)/prefs-actions.ts`, which is what makes it safe to write here —
 * a cookie cannot be set during a render.
 */
export async function writeUiPrefs(next: Partial<UiPrefs>): Promise<UiPrefs> {
  const jar = await cookies();
  const merged: UiPrefs = { ...parse(jar.get(UI_COOKIE)?.value), ...next };

  jar.set(UI_COOKIE, JSON.stringify(merged), {
    path: "/",
    maxAge: MAX_AGE,
    sameSite: "lax",
    // Deliberately NOT httpOnly: this is a display preference, there is
    // nothing to steal, and leaving it readable means a future client-side
    // tweak does not need a round trip.
    httpOnly: false,
  });

  return merged;
}
