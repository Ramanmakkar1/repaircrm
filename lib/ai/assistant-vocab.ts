/**
 * The assistant's fixed vocabularies, shared by the generative interpreter
 * (lib/ai/assistant.ts) and the Jev router (lib/ai/router.ts). Kept apart so
 * neither module has to import the other.
 */

export const SUMMARY_PERIODS = ["today", "yesterday", "this_week", "this_month"] as const;

/**
 * Places the assistant can take someone. A fixed list, mapped to real routes on
 * the server — the model never writes a URL.
 */
export const ASSISTANT_PAGES = [
  "dashboard",
  "new_ticket",
  "new_customer",
  "new_estimate",
  "new_invoice",
  "new_product",
  "tickets",
  "customers",
  "estimates",
  "invoices",
  "pos",
  "inventory",
  "purchase_orders",
  "appointments",
  "leads",
  "marketing",
  "reports",
  "time_clock",
  "shop_display",
  "settings",
  "settings_payments",
  "settings_team",
  "settings_taxes",
  "settings_messaging",
  "settings_saved_replies",
] as const;
