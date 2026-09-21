/**
 * How this shop's card machine works with RepairPilot.
 *
 *   auto    the amount is SENT to a connected machine (Stripe or Square
 *           Terminal); the sale or invoice marks itself paid when the card is
 *           approved. Nobody re-types a number.
 *   manual  the shop owns a standalone machine from its bank. RepairPilot shows
 *           the amount, the cashier keys it in over there, then records the
 *           payment here with one tap.
 *
 * Stored in `Shop.settings.cardMachine`. Manual always works — it needs no
 * processor, no pairing and no credentials — so it is also where "auto" falls
 * back to whenever no machine is connected or the machine is not answering.
 *
 * PURE on purpose: the till and the invoice dialog are Client Components and
 * both import this. Nothing here may reach `next/headers`, Prisma or the
 * session (see the saved-views split for what happens when one does).
 */

export type CardMachineMode = "auto" | "manual";
export type CardMachineProvider = "stripe" | "square";

export type CardMachineSetting = {
  mode: CardMachineMode;
  /** Which machine "auto" sends to when the shop has paired both kinds. */
  provider: CardMachineProvider | null;
};

/** What the Card button should open. */
export type CardFlow = CardMachineProvider | "choose" | "manual";

/**
 * Unset reads as "auto": a shop that paired a machine wants it used, and a
 * shop that never paired one resolves to manual anyway.
 */
export const DEFAULT_CARD_MACHINE: CardMachineSetting = {
  mode: "auto",
  provider: null,
};

export function readCardMachine(settings: unknown): CardMachineSetting {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return DEFAULT_CARD_MACHINE;
  }
  const raw = (settings as Record<string, unknown>).cardMachine;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_CARD_MACHINE;
  }
  const { mode, provider } = raw as Record<string, unknown>;
  return {
    mode: mode === "manual" ? "manual" : "auto",
    provider: provider === "stripe" || provider === "square" ? provider : null,
  };
}

/**
 * The one decision both payment screens make when Card is chosen.
 *
 * `available` is what is actually paired right now, not what the owner hoped
 * for in settings — a preference for a machine that has since been unpaired
 * must not strand the cashier on a dead screen.
 */
export function resolveCardFlow(
  setting: CardMachineSetting,
  available: { stripe: boolean; square: boolean },
): CardFlow {
  if (setting.mode === "manual") return "manual";
  if (setting.provider && available[setting.provider]) return setting.provider;
  if (available.stripe && available.square) return "choose";
  if (available.stripe) return "stripe";
  if (available.square) return "square";
  return "manual";
}
