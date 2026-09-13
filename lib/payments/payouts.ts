/**
 * "Where does my money go, and when?"
 *
 * The one question a shop owner actually has about card payments, and the one
 * the Payments tab could not answer until now — it could say the account was
 * connected and charges were enabled, which is a sentence about Stripe, not
 * about money.
 *
 * Two live reads answer it: the account's payout schedule and bank details
 * (`GET /v1/accounts/{id}`) and what is sitting in the balance right now
 * (`GET /v1/balance`). Both are made with the shop's `Stripe-Account` header,
 * so what comes back is the shop's own money and never the platform's.
 *
 * EVERY STRING HERE IS FINISHED PROSE. `interval=weekly, weekly_anchor=friday,
 * delay_days=2` is Stripe's vocabulary; "Once a week, on Friday. Money from a
 * sale reaches your bank about 2 days after the sale." is the shop's.
 */

import { db } from "@/lib/db";

import { stripeFetch } from "./stripe";

type StripeAccountPayouts = {
  settings?: {
    payouts?: {
      schedule?: {
        interval?: string;
        delay_days?: number;
        weekly_anchor?: string;
        monthly_anchor?: number;
      } | null;
    } | null;
  } | null;
  external_accounts?: {
    data?: {
      object?: string;
      bank_name?: string | null;
      last4?: string | null;
      currency?: string | null;
    }[];
  } | null;
};

type StripeBalance = {
  available?: { amount: number; currency: string }[];
  pending?: { amount: number; currency: string }[];
};

export type MoneyBucket = { amountCents: number; currency: string };

export type PayoutSummary = {
  /** One sentence describing when Stripe sends the money on. */
  scheduleText: string;
  /** "Chase ····6789", or null when no bank account is attached yet. */
  bankText: string | null;
  /** Cleared and on its way. Empty when Stripe would not say. */
  available: MoneyBucket[];
  /** Taken from the customer, not yet cleared. */
  pending: MoneyBucket[];
  /** Where the owner reads the detail. Their dashboard, not ours. */
  dashboardUrl: string;
  /** Set when Stripe could not be asked; every other field is then a default. */
  error: string | null;
};

const ORDINALS = ["th", "st", "nd", "rd"] as const;

/** 1 → "1st", 22 → "22nd". Used for a monthly payout anchor. */
function ordinal(day: number): string {
  const remainder = day % 100;
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : (ORDINALS[day % 10] ?? "th");
  return `${day}${suffix}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Turns Stripe's schedule object into the sentence the tab prints. */
export function describeSchedule(schedule: {
  interval?: string;
  delay_days?: number;
  weekly_anchor?: string;
  monthly_anchor?: number;
} | null | undefined): string {
  const interval = schedule?.interval ?? "daily";
  const delay = schedule?.delay_days;
  // "about 2 days later" is only true if Stripe told us the delay; inventing a
  // number here would be a promise about somebody's rent.
  const tail =
    typeof delay === "number" && delay > 0
      ? ` Money from a sale reaches your bank about ${delay} ${delay === 1 ? "day" : "days"} after the sale.`
      : "";

  if (interval === "manual") {
    return "Stripe holds your money until you ask for it. You can start a transfer any time from your Stripe dashboard.";
  }
  if (interval === "weekly") {
    const day = schedule?.weekly_anchor
      ? capitalise(schedule.weekly_anchor)
      : "Monday";
    return `Stripe sends your money to your bank once a week, on ${day}.${tail}`;
  }
  if (interval === "monthly") {
    const day = ordinal(schedule?.monthly_anchor ?? 1);
    return `Stripe sends your money to your bank once a month, on the ${day}.${tail}`;
  }
  return `Stripe sends your money to your bank every day.${tail}`;
}

/** The connected account's own Stripe dashboard, test or live. */
export function stripeDashboardUrl(testMode: boolean): string {
  return testMode
    ? "https://dashboard.stripe.com/test/balance"
    : "https://dashboard.stripe.com/balance";
}

/**
 * Everything the "How you get paid" panel shows.
 *
 * A shop with no connected account gets the direct-mode answer — the money
 * lands in whoever runs this server's account — because pretending otherwise
 * is the one mistake here nobody would notice until payday.
 */
export async function payoutSummary(input: {
  shopId: string;
  testMode: boolean;
}): Promise<PayoutSummary> {
  const dashboardUrl = stripeDashboardUrl(input.testMode);
  const shop = await db.shop.findUnique({
    where: { id: input.shopId },
    select: { stripeAccountId: true },
  });
  const account = shop?.stripeAccountId ?? null;

  if (!account) {
    return {
      scheduleText:
        "This shop has not connected its own Stripe account yet, so card payments land in the account of whoever runs this RepairPilot server — not in your bank.",
      bankText: null,
      available: [],
      pending: [],
      dashboardUrl,
      error: null,
    };
  }

  const [accountResult, balanceResult] = await Promise.all([
    stripeFetch<StripeAccountPayouts>(
      `/v1/accounts/${encodeURIComponent(account)}`,
    ),
    stripeFetch<StripeBalance>("/v1/balance", { account }),
  ]);

  if (!accountResult.ok) {
    return {
      scheduleText:
        "Stripe could not be reached just now, so we can't say when your next payout lands.",
      bankText: null,
      available: [],
      pending: [],
      dashboardUrl,
      error: accountResult.message,
    };
  }

  const bank = (accountResult.data.external_accounts?.data ?? []).find(
    (entry) => entry.object === "bank_account",
  );

  return {
    scheduleText: describeSchedule(
      accountResult.data.settings?.payouts?.schedule,
    ),
    bankText: bank
      ? `${bank.bank_name ?? "Your bank"}${bank.last4 ? ` ····${bank.last4}` : ""}`
      : null,
    available: balanceResult.ok ? buckets(balanceResult.data.available) : [],
    pending: balanceResult.ok ? buckets(balanceResult.data.pending) : [],
    dashboardUrl,
    // A balance this app could not read is not an error worth alarming anyone
    // with — the schedule sentence, which is the useful half, still rendered.
    error: null,
  };
}

/** Drops the zero rows Stripe returns for currencies a shop has never used. */
function buckets(
  entries: { amount: number; currency: string }[] | undefined,
): MoneyBucket[] {
  return (entries ?? [])
    .filter((entry) => Number(entry.amount) !== 0)
    .map((entry) => ({
      amountCents: Math.round(Number(entry.amount)),
      currency: String(entry.currency ?? "").toLowerCase(),
    }));
}
