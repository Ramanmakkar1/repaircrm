/** Public payment-provider catalogue used by Settings and onboarding. */

export const TARGET_COUNTRIES = ["NZ", "US", "CA", "GB"] as const;
export type TargetCountry = (typeof TARGET_COUNTRIES)[number];

export type PaymentProviderId =
  | "stripe"
  | "square"
  | "windcave"
  | "worldline"
  | "moneris"
  | "clover"
  | "sumup"
  | "paypal";

export type ProviderConnectionMode = "oauth" | "api_credentials" | "partner_approval";

export type PaymentProviderDefinition = {
  id: PaymentProviderId;
  name: string;
  countries: readonly TargetCountry[];
  connectionMode: ProviderConnectionMode;
  capabilities: readonly ("online" | "terminal" | "wallets" | "bank")[];
  description: string;
  availableNow: boolean;
};

/**
 * `availableNow` means RepairPilot has an executable connector, not merely that
 * the provider operates in the country. Partner-certified terminal products
 * stay visible without presenting a button that cannot finish.
 */
export const PAYMENT_PROVIDERS: readonly PaymentProviderDefinition[] = [
  {
    id: "stripe",
    name: "Stripe",
    countries: TARGET_COUNTRIES,
    connectionMode: "oauth",
    capabilities: ["online", "terminal", "wallets", "bank"],
    description: "Online payments, saved cards, payment links and Stripe Terminal.",
    availableNow: true,
  },
  {
    id: "square",
    name: "Square",
    countries: ["US", "CA", "GB"],
    connectionMode: "oauth",
    capabilities: ["online", "terminal", "wallets"],
    description: "Square account connection, Terminal pairing and automatic settlement.",
    availableNow: true,
  },
  {
    id: "windcave",
    name: "Windcave",
    countries: ["NZ", "US", "CA", "GB"],
    connectionMode: "api_credentials",
    capabilities: ["online", "terminal", "wallets"],
    description: "New Zealand payment gateway and integrated EFTPOS.",
    availableNow: false,
  },
  {
    id: "worldline",
    name: "Worldline",
    countries: ["NZ", "GB"],
    connectionMode: "partner_approval",
    capabilities: ["online", "terminal"],
    description: "Regional EFTPOS and acquiring connection.",
    availableNow: false,
  },
  {
    id: "moneris",
    name: "Moneris",
    countries: ["CA"],
    connectionMode: "api_credentials",
    capabilities: ["online", "terminal", "wallets"],
    description: "Canadian card processing and smart terminals.",
    availableNow: false,
  },
  {
    id: "clover",
    name: "Clover",
    countries: ["US", "CA", "GB"],
    connectionMode: "oauth",
    capabilities: ["online", "terminal", "wallets"],
    description: "Clover merchant accounts and countertop devices.",
    availableNow: false,
  },
  {
    id: "sumup",
    name: "SumUp",
    countries: ["US", "GB"],
    connectionMode: "oauth",
    capabilities: ["online", "terminal", "wallets"],
    description: "Mobile and countertop card acceptance.",
    availableNow: false,
  },
  {
    id: "paypal",
    name: "PayPal",
    countries: TARGET_COUNTRIES,
    connectionMode: "partner_approval",
    capabilities: ["online", "wallets"],
    description: "PayPal wallet and Pay Later options for online checkout.",
    availableNow: false,
  },
] as const;

export function providersForCountry(country: string): PaymentProviderDefinition[] {
  const normalized = country.trim().toUpperCase() as TargetCountry;
  return PAYMENT_PROVIDERS.filter((provider) => provider.countries.includes(normalized));
}
