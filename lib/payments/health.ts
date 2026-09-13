/**
 * "Test payments" — the button somebody presses when a card just got refused.
 *
 * WHY IT DOES REAL WORK
 * ---------------------
 * A self-check that reads the database and reports "looks fine" is worse than
 * no self-check: it is confidently wrong at the exact moment somebody needs an
 * answer. So every line here costs a network call — the account is fetched from
 * Stripe, the confirmation endpoint is fetched from Stripe, the readers are
 * listed from Stripe, and the round trip is proved by posting a signed message
 * to this app's own public address and watching for it to arrive.
 *
 * WHAT A LINE IS ALLOWED TO SAY
 * -----------------------------
 * A result is a plain sentence about the shop's situation and, when it fails,
 * ONE instruction naming exactly what to do and where. No error codes, no
 * `whsec_`, no "webhook", no "intent". If a line cannot be written that way it
 * does not belong on this screen.
 */

import {
  currencySupported,
  paymentsCurrency,
  paymentsLive,
  stripeSecretKey,
  stripeWebhookSecret,
} from "./config";
import { connectStatus } from "./connect";
import {
  PING_EVENT_TYPE,
  checkAppAddress,
  readRemoteEndpoint,
  webhookSecretForShop,
  webhookSetupStatus,
  WEBHOOK_EVENTS,
} from "./endpoint";
import { listReaders } from "./terminal";
import { stripeClientId, stripeTestMode } from "./stripe";
import { signPayload } from "./webhook";

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export type CheckLine = {
  id: string;
  /** The thing being checked, as a shop owner would name it. */
  label: string;
  status: CheckStatus;
  /** What was found. One sentence. */
  detail: string;
  /** What to do about it. Null when there is nothing to do. */
  fix: string | null;
};

export type PaymentsHealth = {
  ranAt: string;
  /** True when nothing is failing. Warnings do not stop money moving. */
  ok: boolean;
  lines: CheckLine[];
};

/** How long to wait for our own ping to come back before giving up on it. */
const PING_TIMEOUT_MS = 8_000;

/**
 * Runs the whole check for one shop.
 *
 * Every read is scoped to `shopId`; nothing is taken from a caller but that id,
 * and it comes from the session.
 */
export async function runPaymentsHealthCheck(
  shopId: string,
): Promise<PaymentsHealth> {
  const lines: CheckLine[] = [];

  // 1. Is the feature switched on at all? Everything below assumes a key.
  if (!paymentsLive()) {
    lines.push({
      id: "server",
      label: "Card payments switched on",
      status: "fail",
      detail: "This RepairPilot server has no Stripe key, so no card can be charged.",
      fix: `Ask whoever runs this server to set ${
        stripeSecretKey() ? "PAYMENTS_DRIVER=stripe" : "STRIPE_SECRET_KEY"
      } and restart it.`,
    });
    return finish(lines);
  }

  lines.push({
    id: "server",
    label: "Card payments switched on",
    status: "pass",
    detail: stripeTestMode()
      ? "This server is running on Stripe test keys — cards are practice only, no real money moves."
      : "This server is set up to take real card payments.",
    fix: null,
  });

  // 2. Currency. A three-decimal currency would charge 100x, so it is refused.
  const currency = paymentsCurrency();
  lines.push(
    currencySupported(currency)
      ? {
          id: "currency",
          label: "Currency",
          status: "pass",
          detail: `Sales are charged in ${currency.toUpperCase()}.`,
          fix: null,
        }
      : {
          id: "currency",
          label: "Currency",
          status: "fail",
          detail: `${currency.toUpperCase()} isn't a currency RepairPilot can charge in — it doesn't split into 100 cents, and every amount here is stored in cents.`,
          fix: "Ask whoever runs this server to set PAYMENTS_CURRENCY to a two-decimal currency such as usd, cad, eur or gbp.",
        },
  );

  // 3. The connection itself, and what Stripe says the account may do.
  const connection = await connectStatus(shopId);
  if (!connection.connected) {
    lines.push({
      id: "account",
      label: "Your Stripe account",
      status: "warn",
      detail:
        "This shop hasn't connected its own Stripe account, so card payments land in the account of whoever runs this server.",
      fix: stripeClientId()
        ? "Press Connect with Stripe at the top of this tab to have the money paid into your own bank."
        : "Ask whoever runs this server to set STRIPE_CLIENT_ID so shops can connect their own Stripe account.",
    });
  } else if (connection.accountError) {
    lines.push({
      id: "account",
      label: "Your Stripe account",
      status: "fail",
      detail: `Stripe didn't answer when we asked about your account: ${connection.accountError}`,
      fix: "Wait a minute and press Test payments again. If it keeps failing, check status.stripe.com, then reconnect your account from this tab.",
    });
  } else {
    lines.push({
      id: "account",
      label: "Your Stripe account",
      status: "pass",
      detail: `Connected${connection.account?.businessName ? ` as ${connection.account.businessName}` : ""}.`,
      fix: null,
    });

    lines.push(
      connection.account?.chargesEnabled
        ? {
            id: "charges",
            label: "Taking cards",
            status: "pass",
            detail: "Stripe is letting this account take card payments.",
            fix: null,
          }
        : {
            id: "charges",
            label: "Taking cards",
            status: "fail",
            detail: `Stripe has paused card payments on this account${
              connection.account?.disabledReason
                ? ` (${connection.account.disabledReason})`
                : ""
            }. Every card will be declined.`,
            fix: "Sign in to Stripe and finish the questions on their dashboard — usually proof of identity or a bank account.",
          },
    );

    lines.push(
      connection.account?.payoutsEnabled
        ? {
            id: "payouts",
            label: "Paying you out",
            status: "pass",
            detail: "Stripe can send the money on to your bank.",
            fix: null,
          }
        : {
            id: "payouts",
            label: "Paying you out",
            status: "warn",
            detail:
              "Stripe is holding your money rather than sending it to your bank. Cards still work; the money just stays at Stripe.",
            fix: "Sign in to Stripe and add or confirm your bank account.",
          },
    );
  }

  // 4. Can Stripe reach this app at all? Everything below this is downstream
  //    of the answer, so it is checked before the endpoint itself.
  const address = checkAppAddress();
  lines.push(
    address.publicAddress
      ? {
          id: "address",
          label: "This app's web address",
          status: "pass",
          detail: `Stripe can reach this app at ${address.url}.`,
          fix: null,
        }
      : {
          id: "address",
          label: "This app's web address",
          status: "warn",
          detail: address.message,
          fix: "Ask whoever runs this server to set NEXT_PUBLIC_APP_URL to the address customers use, then press Retry setup on this tab.",
        },
  );

  // 5. The confirmation endpoint, checked against Stripe rather than trusted
  //    from our own row — the owner may have deleted it in the dashboard.
  const setup = await webhookSetupStatus(shopId);
  await checkConfirmations({ lines, shopId, connection, setup, address });

  // 6. A reader, if this shop has ever had one.
  const readers = await listReaders(shopId);
  if (!readers.ok) {
    lines.push({
      id: "reader",
      label: "Card machine",
      status: "warn",
      detail: `We couldn't ask Stripe about your card machines: ${readers.reason}`,
      fix: "Press Test payments again in a minute.",
    });
  } else if (readers.readers.length === 0) {
    lines.push({
      id: "reader",
      label: "Card machine",
      status: "skipped",
      detail: "No card machine is set up. Customers can still pay by link or by a card you keep on file.",
      fix: null,
    });
  } else {
    const online = readers.readers.filter((reader) => reader.status === "online");
    lines.push(
      online.length > 0
        ? {
            id: "reader",
            label: "Card machine",
            status: "pass",
            detail: `${online.length} of ${readers.readers.length} switched on and ready: ${online
              .map((reader) => reader.label)
              .join(", ")}.`,
            fix: null,
          }
        : {
            id: "reader",
            label: "Card machine",
            status: "fail",
            detail: `None of your ${readers.readers.length} card machines are answering.`,
            fix: "Switch the machine on, make sure it is on the same wifi as this computer, and give it a minute to come back.",
          },
    );
  }

  return finish(lines);
}

/**
 * Two lines about payment confirmations: is one registered, and does it work?
 *
 * The second is the one that matters. A registered endpoint pointing at an
 * address that stopped resolving looks perfect in every dashboard and quietly
 * leaves every invoice unpaid, so the check posts a signed message to the
 * app's own public URL and waits to see it arrive.
 */
async function checkConfirmations(input: {
  lines: CheckLine[];
  shopId: string;
  connection: Awaited<ReturnType<typeof connectStatus>>;
  setup: Awaited<ReturnType<typeof webhookSetupStatus>>;
  address: ReturnType<typeof checkAppAddress>;
}): Promise<void> {
  const { lines, shopId, connection, setup, address } = input;

  // Direct mode: the platform's own endpoint and env secret serve this shop.
  if (!connection.connected || !connection.accountId) {
    const secret = stripeWebhookSecret();
    lines.push(
      secret
        ? {
            id: "confirmations",
            label: "Payment confirmations",
            status: "pass",
            detail:
              "This server confirms payments through its own shared setup, because this shop hasn't connected its own Stripe account.",
            fix: null,
          }
        : {
            id: "confirmations",
            label: "Payment confirmations",
            status: "fail",
            detail:
              "Nothing is set up to tell RepairPilot when a card has been charged, so paid invoices will stay marked unpaid.",
            fix: "Connect your own Stripe account at the top of this tab — RepairPilot sets the rest up for you. Otherwise, ask whoever runs this server to set STRIPE_WEBHOOK_SECRET.",
          },
    );
    if (secret) await pingLine(lines, { secret, account: null, address });
    return;
  }

  if (!setup.automatic) {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "fail",
      detail:
        setup.error ??
        "RepairPilot hasn't finished telling Stripe where to send payment confirmations, so paid invoices may stay marked unpaid.",
      // On a private address there is no Retry button, because retrying would
      // do the same nothing. Sending someone to look for one is how a
      // diagnostic screen loses the person reading it.
      fix: address.publicAddress
        ? "Press Retry setup in the Getting paid panel on this tab."
        : "Put this app on a web address customers can reach, then press Retry setup in the Getting paid panel.",
    });
    return;
  }

  const remote = await readRemoteEndpoint({
    accountId: connection.accountId,
    endpointId: setup.endpointId ?? "",
  });

  if (!remote.ok) {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "fail",
      detail: `Stripe no longer has the setup RepairPilot created: ${remote.reason}`,
      fix: "Press Retry setup in the Getting paid panel on this tab to put it back.",
    });
    return;
  }

  const missing = WEBHOOK_EVENTS.filter(
    (event) => !remote.events.includes(event) && !remote.events.includes("*"),
  );

  if (!remote.enabled) {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "fail",
      detail: "Stripe has switched off the connection that confirms payments.",
      fix: "Press Retry setup in the Getting paid panel on this tab.",
    });
  } else if (remote.url !== address.url) {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "fail",
      detail: `Stripe is sending confirmations to ${remote.url ?? "an old address"}, but this app now answers at ${address.url}.`,
      fix: "Press Retry setup in the Getting paid panel on this tab to point Stripe at the new address.",
    });
  } else if (missing.length > 0) {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "warn",
      detail: `Stripe isn't sending everything RepairPilot needs (${missing.length} missing), so some refunds or payments may not show up here.`,
      fix: "Press Retry setup in the Getting paid panel on this tab.",
    });
  } else {
    lines.push({
      id: "confirmations",
      label: "Payment confirmations",
      status: "pass",
      detail: "Stripe knows where to tell RepairPilot that a card has been charged.",
      fix: null,
    });
  }

  const secret = await webhookSecretForShop(shopId);
  if (secret) {
    await pingLine(lines, { secret, account: connection.accountId, address });
  }
}

/**
 * Posts a signed message to this app's own public address and waits for it.
 *
 * This is the only check that proves the whole chain at once: DNS resolves,
 * the app is up, the route is mounted, and the stored signing secret is the
 * one the route verifies against. A wrong secret fails here and nowhere else.
 *
 * The route echoes the nonce back. Comparing it is what makes a 200 mean "this
 * message was read" rather than "something answered on that address" — a proxy,
 * a holding page or a cached response would all return 200 and none of them
 * would know the nonce.
 */
async function pingLine(
  lines: CheckLine[],
  input: {
    secret: string;
    account: string | null;
    address: ReturnType<typeof checkAppAddress>;
  },
): Promise<void> {
  if (!input.address.publicAddress) {
    lines.push({
      id: "roundtrip",
      label: "Confirmation test message",
      status: "skipped",
      detail:
        "Skipped — this app is on a private address, so there is nothing for Stripe to reach.",
      fix: null,
    });
    return;
  }

  const nonce = `ping_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const event = {
    id: `evt_${nonce}`,
    object: "event",
    type: PING_EVENT_TYPE,
    created: Math.floor(Date.now() / 1000),
    data: { object: { nonce } },
    ...(input.account ? { account: input.account } : {}),
  };
  const payload = JSON.stringify(event);
  const header = signPayload(payload, input.secret, Math.floor(Date.now() / 1000));

  let status = 0;
  let echoed: string | null = null;
  let networkError: string | null = null;
  try {
    const response = await fetch(input.address.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": header,
      },
      body: payload,
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      cache: "no-store",
    });
    status = response.status;
    const body = (await response.json().catch(() => null)) as {
      nonce?: unknown;
    } | null;
    echoed = typeof body?.nonce === "string" ? body.nonce : null;
  } catch (error) {
    networkError = error instanceof Error ? error.message : "unknown error";
  }

  if (networkError) {
    lines.push({
      id: "roundtrip",
      label: "Confirmation test message",
      status: "fail",
      detail: `We sent a test message to ${input.address.url} and it never arrived (${networkError}).`,
      fix: "Check the app is reachable from outside your shop at that address, and that nothing in front of it is blocking POST requests.",
    });
    return;
  }

  if (status !== 200) {
    lines.push({
      id: "roundtrip",
      label: "Confirmation test message",
      status: "fail",
      detail: `The test message came back refused (${status}), which means a real confirmation from Stripe would be refused too.`,
      fix: "Press Retry setup in the Getting paid panel on this tab — the stored signing key no longer matches.",
    });
    return;
  }

  lines.push(
    echoed === nonce
      ? {
          id: "roundtrip",
          label: "Confirmation test message",
          status: "pass",
          detail:
            "We sent a test confirmation to this app's public address and it arrived, was checked and was accepted.",
          fix: null,
        }
      : {
          id: "roundtrip",
          label: "Confirmation test message",
          status: "fail",
          detail: `Something answered at ${input.address.url}, but it was not this app.`,
          fix: "Check that NEXT_PUBLIC_APP_URL points at RepairPilot and not at a holding page or another site on the same address.",
        },
  );
}

function finish(lines: CheckLine[]): PaymentsHealth {
  return {
    ranAt: new Date().toISOString(),
    ok: lines.every((line) => line.status !== "fail"),
    lines,
  };
}
