/**
 * AI provider configuration.
 *
 * Same shape as lib/comms/config.ts: the driver is chosen entirely by
 * environment, so a call site works unchanged whether the shop is on a hosted
 * model, a local one, or none at all.
 *
 *   AI_DRIVER = off | anthropic | ollama
 *   AI_MODEL  = provider-specific model id (each driver has a sane default)
 *
 *   anthropic  ANTHROPIC_API_KEY
 *   ollama     OLLAMA_URL (default http://localhost:11434)
 *
 * DEFAULT IS "off", deliberately.
 *
 * lib/comms defaults to "log" because a misconfigured deploy printing an email
 * is harmless. AI is the opposite: the drivers here are the only place in
 * RepairPilot that sends ticket text to a third party, so that has to be an
 * explicit decision, never something a shop backs into because a key happened
 * to be present in the environment for some other reason. The one concession is
 * that ANTHROPIC_API_KEY *by itself* implies "anthropic" — setting a provider
 * key is already that explicit decision.
 */

import type { AiDriverName } from "./types";

const DRIVERS: readonly AiDriverName[] = ["off", "anthropic", "ollama"];

/**
 * Unrecognised values fall back to "off" rather than to a provider: a typo in
 * `AI_DRIVER` must not decide, on its own, that ticket text leaves the building.
 */
export function aiDriverName(): AiDriverName {
  const explicit = process.env.AI_DRIVER?.trim().toLowerCase();
  if (explicit) {
    return DRIVERS.includes(explicit as AiDriverName)
      ? (explicit as AiDriverName)
      : "off";
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "off";
}

/** True when the UI should offer AI affordances at all. */
export function aiEnabled(): boolean {
  return aiDriverName() !== "off";
}

export function aiModel(fallback: string): string {
  return process.env.AI_MODEL?.trim() || fallback;
}

export function ollamaUrl(): string {
  const raw = process.env.OLLAMA_URL?.trim() || "http://localhost:11434";
  return raw.replace(/\/+$/, "");
}

/**
 * Generation is on the critical path of a button the user is watching. Thirty
 * seconds is already past the point where they've decided it's broken — past
 * that, a clear failure beats a spinner.
 */
export const AI_TIMEOUT_MS = 30_000;
