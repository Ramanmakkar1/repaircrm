/**
 * A pretend Stripe, for developing against.
 *
 *     node scripts/dev/fake-stripe.mjs            # listens on :4242
 *
 * WHY THIS EXISTS
 * ---------------
 * Every payment path in this app — Connect onboarding, hosted checkout, a card
 * saved on file, an off-session charge, a card reader, a refund — is a round
 * trip to Stripe followed by a signed webhook coming back. None of it can be
 * exercised without keys, and keys are not something a contributor should need
 * to see the register work. So this implements the handful of REST endpoints
 * lib/payments actually calls, with realistic response shapes, and fires the
 * matching webhooks back at the app with a genuine HMAC signature.
 *
 * It is NOT shipped: nothing under scripts/ is imported by the app, and the
 * only thing pointing at it is an env var.
 *
 *     STRIPE_SECRET_KEY=sk_test_fake
 *     STRIPE_CLIENT_ID=ca_fake
 *     STRIPE_WEBHOOK_SECRET=whsec_fake
 *     STRIPE_API_BASE=http://localhost:4242
 *     NEXT_PUBLIC_STRIPE_TERMINAL_JS=http://localhost:4242/terminal/v1/
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * No persistence, no pagination, no expansion, no rate limits, and no attempt
 * to be right about anything the app does not read. A fixture that grows into
 * a second implementation of Stripe is a fixture nobody trusts.
 *
 * Test cards: a `?decline=1` on the hosted page declines instead of paying.
 */

import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 4242);
const SELF = process.env.FAKE_STRIPE_SELF ?? `http://localhost:${PORT}`;
const APP = process.env.FAKE_STRIPE_APP ?? "http://localhost:3024";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_fake";
const WEBHOOK_URL = `${APP}/api/webhooks/stripe`;

/** Set to an acct_… to make every event look like a Connect event. */
let connectedAccount = null;

const db = {
  sessions: new Map(),
  intents: new Map(),
  setupIntents: new Map(),
  paymentMethods: new Map(),
  customers: new Map(),
  refunds: new Map(),
  readers: new Map(),
  locations: new Map(),
};

let seq = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}fake`;

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

async function fire(type, object, account) {
  const event = {
    id: id("evt"),
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  };
  if (account) event.account = account;

  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": `t=${timestamp},v1=${signature}`,
      },
      body: payload,
    });
    const text = await response.text();
    console.log(`  → webhook ${type} ${response.status} ${text.slice(0, 120)}`);
  } catch (error) {
    console.log(`  → webhook ${type} FAILED ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Form decoding — Stripe's bracket syntax back into an object
// ---------------------------------------------------------------------------

function decodeForm(body) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const path = rawKey.replace(/\]/g, "").split("[");
    let node = out;
    for (let i = 0; i < path.length - 1; i++) {
      node[path[i]] ??= {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = value;
  }
  return out;
}

/** `{ "0": "card_present" }` reads back as an array. */
function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const form = raw ? decodeForm(raw) : {};
  const account = req.headers["stripe-account"] ?? null;

  console.log(`${req.method} ${url.pathname}${account ? ` (acct ${account})` : ""}`);

  // The browser stub below is served to a page on another origin and posts
  // back here, so every response has to be readable cross-origin. Development
  // only — a real Stripe would not, and should not, do this.
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Account",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  const json = (body, status = 200) => {
    res.writeHead(status, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const html = (body) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  };
  const redirect = (to) => {
    res.writeHead(302, { Location: to });
    res.end();
  };
  const fail = (message, code = "resource_missing", status = 400) =>
    json({ error: { message, code, type: "invalid_request_error" } }, status);

  try {
    await route({ req, res, url, form, account, json, html, redirect, fail });
  } catch (error) {
    console.error(error);
    fail(error.message, "api_error", 500);
  }
});

async function route(ctx) {
  const { req, res, url, form, account, json, html, redirect, fail } = ctx;
  const path = url.pathname;

  // ------------------------------------------------------------- Connect ---

  if (path === "/oauth/authorize") {
    // Stands in for Stripe's consent screen.
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", id("ac"));
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    const deny = new URL(url.searchParams.get("redirect_uri"));
    deny.searchParams.set("error", "access_denied");
    return html(page("Connect a Stripe account", [
      ["Authorize", back.toString()],
      ["Cancel", deny.toString()],
    ]));
  }

  if (path === "/oauth/token") {
    connectedAccount = connectedAccount ?? id("acct");
    return json({
      access_token: id("sk_test"),
      stripe_user_id: connectedAccount,
      livemode: false,
      scope: "read_write",
      token_type: "bearer",
    });
  }

  if (path === "/oauth/deauthorize") {
    const revoked = form.stripe_user_id;
    // Stripe notifies the platform out of band; so do we.
    setTimeout(() => fire("account.application.deauthorized", { id: id("ca") }, revoked), 50);
    if (connectedAccount === revoked) connectedAccount = null;
    return json({ stripe_user_id: revoked });
  }

  if (path.startsWith("/v1/accounts/")) {
    const accountId = decodeURIComponent(path.split("/")[3]);
    return json({
      id: accountId,
      object: "account",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: "usd",
      country: "US",
      email: "owner@example.test",
      business_profile: { name: "Fake Connected Shop" },
      requirements: { disabled_reason: null },
    });
  }

  // ------------------------------------------------------------ Customers --

  if (path === "/v1/customers" && req.method === "POST") {
    const customer = {
      id: id("cus"),
      object: "customer",
      name: form.name ?? null,
      email: form.email ?? null,
      metadata: form.metadata ?? {},
    };
    db.customers.set(customer.id, customer);
    return json(customer);
  }

  // -------------------------------------------------------------- Checkout --

  if (path === "/v1/checkout/sessions" && req.method === "POST") {
    const session = {
      id: id("cs_test"),
      object: "checkout.session",
      mode: form.mode ?? "payment",
      amount_total: Number(form.line_items?.["0"]?.price_data?.unit_amount ?? 0),
      currency: form.line_items?.["0"]?.price_data?.currency ?? "usd",
      payment_status: "unpaid",
      customer: form.customer ?? null,
      client_reference_id: form.client_reference_id ?? null,
      metadata: form.metadata ?? {},
      payment_intent_metadata: form.payment_intent_data?.metadata ?? {},
      success_url: form.success_url,
      cancel_url: form.cancel_url,
      account,
    };
    session.url = `${SELF}/hosted/${session.id}`;
    db.sessions.set(session.id, session);
    return json({ id: session.id, url: session.url, object: "checkout.session" });
  }

  if (path.startsWith("/hosted/")) {
    const session = db.sessions.get(path.split("/")[2]);
    if (!session) return fail("no such session");

    if (url.searchParams.get("go") !== "1") {
      const label =
        session.mode === "setup"
          ? "Save this card"
          : `Pay ${(session.amount_total / 100).toFixed(2)}`;
      return html(page("Fake Stripe Checkout", [
        [label, `${url.pathname}?go=1`],
        ["Cancel", session.cancel_url],
      ]));
    }

    if (session.mode === "setup") {
      const method = {
        id: id("pm"),
        object: "payment_method",
        type: "card",
        card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
      };
      const setup = {
        id: id("seti"),
        object: "setup_intent",
        status: "succeeded",
        payment_method: method.id,
      };
      db.paymentMethods.set(method.id, method);
      db.setupIntents.set(setup.id, setup);
      session.setup_intent = setup.id;
      session.payment_status = "no_payment_required";
      await fire("checkout.session.completed", session, session.account);
      return redirect(session.success_url);
    }

    const intent = {
      id: id("pi"),
      object: "payment_intent",
      status: "succeeded",
      amount: session.amount_total,
      amount_received: session.amount_total,
      currency: session.currency,
      latest_charge: id("ch"),
      metadata: session.payment_intent_metadata,
    };
    db.intents.set(intent.id, intent);
    session.payment_intent = intent.id;
    session.payment_status = "paid";

    await fire("checkout.session.completed", session, session.account);
    // Stripe sends both. The app must record the money exactly once.
    await fire("payment_intent.succeeded", intent, session.account);
    return redirect(session.success_url);
  }

  // -------------------------------------------------- SetupIntents / PMs ---

  if (path.startsWith("/v1/setup_intents/")) {
    const setup = db.setupIntents.get(decodeURIComponent(path.split("/")[3]));
    return setup ? json(setup) : fail("no such setup intent");
  }

  if (path.endsWith("/detach") && req.method === "POST") {
    const methodId = decodeURIComponent(path.split("/")[3]);
    db.paymentMethods.delete(methodId);
    return json({ id: methodId, object: "payment_method", customer: null });
  }

  if (path.startsWith("/v1/payment_methods/")) {
    const method = db.paymentMethods.get(decodeURIComponent(path.split("/")[3]));
    return method ? json(method) : fail("no such payment method");
  }

  // ----------------------------------------------------- PaymentIntents ----

  if (path === "/v1/payment_intents" && req.method === "POST") {
    const types = asList(form.payment_method_types);
    const cardPresent = types.includes("card_present");
    const amount = Number(form.amount ?? 0);

    const intentId = id("pi");
    const intent = {
      id: intentId,
      object: "payment_intent",
      // A card-present intent is created empty and filled by the reader; an
      // off-session confirm=true intent succeeds immediately.
      status: cardPresent ? "requires_payment_method" : "succeeded",
      amount,
      amount_received: cardPresent ? 0 : amount,
      currency: form.currency ?? "usd",
      // Real Stripe client secrets are `<intent id>_secret_<random>`; the
      // browser stub below relies on that shape, exactly as the real SDK does.
      client_secret: `${intentId}_secret_fake`,
      latest_charge: cardPresent ? null : id("ch"),
      metadata: form.metadata ?? {},
      account,
    };
    db.intents.set(intent.id, intent);

    if (!cardPresent) {
      // The synchronous path records this itself; the webhook proves the
      // dedupe holds when both arrive.
      setTimeout(() => fire("payment_intent.succeeded", intent, account), 40);
    }
    return json(intent);
  }

  if (path.startsWith("/v1/payment_intents/")) {
    const intent = db.intents.get(decodeURIComponent(path.split("/")[3]));
    return intent ? json(intent) : fail("no such payment intent");
  }

  // ------------------------------------------- Terminal (server side) ------

  if (path === "/v1/terminal/connection_tokens" && req.method === "POST") {
    return json({ object: "terminal.connection_token", secret: id("pst_test") });
  }

  if (path === "/v1/terminal/locations" && req.method === "POST") {
    const location = {
      id: id("tml"),
      object: "terminal.location",
      display_name: form.display_name,
      address: form.address,
    };
    db.locations.set(location.id, location);
    return json(location);
  }

  if (path === "/v1/terminal/readers") {
    if (req.method === "POST") {
      const reader = {
        id: id("tmr"),
        object: "terminal.reader",
        label: form.label ?? "Counter reader",
        status: "online",
        device_type: "simulated_wisepos_e",
        serial_number: id("SN").toUpperCase(),
        location: form.location,
      };
      db.readers.set(reader.id, reader);
      return json(reader);
    }
    const location = url.searchParams.get("location");
    const readers = [...db.readers.values()].filter(
      (reader) => !location || reader.location === location,
    );
    return json({ object: "list", data: readers, has_more: false });
  }

  // ------------------------------------------ Terminal (browser stub) ------

  if (path === "/terminal/v1/" || path === "/terminal/v1") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/javascript",
    });
    return res.end(terminalStub());
  }

  /** The stub reader calls this to move an intent to succeeded. */
  if (path === "/fake/terminal/process" && req.method === "POST") {
    const intent = db.intents.get(form.payment_intent);
    if (!intent) return fail("no such payment intent");
    intent.status = "succeeded";
    intent.amount_received = intent.amount;
    intent.latest_charge = id("ch");
    setTimeout(() => fire("payment_intent.succeeded", intent, intent.account), 40);
    return json(intent);
  }

  // ---------------------------------------------------------- Refunds ------

  if (path === "/v1/refunds" && req.method === "POST") {
    const refund = {
      id: id("re"),
      object: "refund",
      // Deliberately NOT succeeded: this is the interesting case, where the
      // app has to leave the row pending and let the webhook finish it.
      status: "pending",
      amount: Number(form.amount ?? 0),
      payment_intent: form.payment_intent ?? null,
      charge: id("ch"),
      metadata: form.metadata ?? {},
    };
    db.refunds.set(refund.id, refund);

    setTimeout(() => {
      refund.status = "succeeded";
      fire("refund.updated", refund, account);
      fire(
        "charge.refunded",
        {
          id: refund.charge,
          object: "charge",
          payment_intent: refund.payment_intent,
          refunded: true,
          amount_refunded: refund.amount,
          refunds: { object: "list", data: [refund] },
        },
        account,
      );
    }, 1200);

    return json(refund);
  }

  return fail(`fake-stripe does not implement ${path}`, "resource_missing", 404);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function page(title, links) {
  const buttons = links
    .map(
      ([label, href]) =>
        `<a href="${href}" style="display:block;margin:8px 0;padding:14px 18px;border-radius:8px;background:#635bff;color:#fff;text-decoration:none;font-weight:600;text-align:center">${label}</a>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:15px system-ui;background:#f6f8fa;margin:0;display:grid;place-items:center;height:100vh">
<div style="background:#fff;border:1px solid #e3e8ee;border-radius:12px;padding:28px;width:360px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
<h1 style="margin:0 0 4px;font-size:18px">${title}</h1>
<p style="margin:0 0 18px;color:#697386">fake-stripe · development only</p>
${buttons}</div></body>`;
}

/**
 * A stand-in for js.stripe.com/terminal/v1/.
 *
 * Implements only the four calls components/payments/use-stripe-terminal.ts
 * makes, in the same shapes, so the register's step states are exercised for
 * real rather than mocked inside the app.
 */
function terminalStub() {
  return `window.StripeTerminal = {
  create: function (config) {
    return {
      discoverReaders: async function () {
        return { discoveredReaders: [{ id: 'tmr_sim_fake', label: 'Simulated reader', status: 'online', device_type: 'simulated_wisepos_e' }] };
      },
      connectReader: async function (reader) {
        return { reader: reader };
      },
      collectPaymentMethod: async function (clientSecret) {
        await new Promise(function (r) { setTimeout(r, 600); });
        return { paymentIntent: { id: String(clientSecret).split('_secret_')[0], status: 'requires_confirmation' } };
      },
      processPayment: async function (intent) {
        var body = new URLSearchParams({ payment_intent: intent.id });
        var res = await fetch('${SELF}/fake/terminal/process', { method: 'POST', body: body });
        if (!res.ok) return { error: { message: 'fake reader could not process that payment' } };
        var json = await res.json();
        return { paymentIntent: { id: json.id, status: json.status } };
      },
      disconnectReader: async function () { return {}; },
      getConnectionStatus: function () { return 'connected'; }
    };
  }
};`;
}

server.listen(PORT, () => {
  console.log(`fake-stripe listening on ${SELF}`);
  console.log(`  webhooks → ${WEBHOOK_URL}`);
});
