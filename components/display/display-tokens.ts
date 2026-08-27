/**
 * Fixed (non-theme-reactive) color palette for the /display wall-TV board.
 *
 * The board must always render as a deep near-black high-contrast surface,
 * regardless of the viewing device's OS light/dark preference — this page is
 * shown on a shop-floor TV, not read by a person who might have "light mode"
 * switched on. Since app/globals.css only swaps its status tokens inside an
 * `@media (prefers-color-scheme: dark)` block (there is no class/data-theme
 * toggle to force in this app), the hex values below are copied verbatim from
 * that dark-mode block instead of referencing the CSS custom properties, so
 * the board looks identical no matter what the viewer's OS prefers.
 *
 * Pure data — no "use client", no server-only imports — safe to import from
 * both the server page and client subcomponents.
 */

import type { StatusKey } from "@/components/ui/badge";
import type { StalenessLevel } from "@/components/tickets/ticket-meta";

/** Header status chips — same 6 semantic hues as the rest of the app. */
export const STATUS_TV_COLORS: Record<StatusKey, { bg: string; fg: string }> = {
  new: { bg: "#17233c", fg: "#9cbdfa" },
  "in-progress": { bg: "#322510", fg: "#f0bd73" },
  waiting: { bg: "#271f3d", fg: "#c6adf7" },
  ready: { bg: "#102a26", fg: "#6ed3c5" },
  resolved: { bg: "#132a1b", fg: "#86e6a6" },
  overdue: { bg: "#3a1917", fg: "#f58881" },
};

/**
 * Tile backgrounds by staleness (the RepairShopr "how long has this been
 * sitting" heat-map). Slightly more saturated than the header chip colors
 * since tiles are the star of the board and need to read from across a room.
 * Text on every tile stays white/near-white; only the background carries the
 * staleness color.
 */
export const STALENESS_TV_COLORS: Record<StalenessLevel, { bg: string }> = {
  none: { bg: "#1c1b18" },
  fresh: { bg: "#123a20" },
  warm: { bg: "#4a350f" },
  stale: { bg: "#4a2810" },
  critical: { bg: "#4a1414" },
};
