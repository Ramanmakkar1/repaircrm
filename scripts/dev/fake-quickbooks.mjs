#!/usr/bin/env node
/**
 * A stand-in QuickBooks Online, for development only.
 *
 * WHY THIS EXISTS
 * ---------------
 * The QuickBooks integration cannot be verified without Intuit credentials,
 * and "it compiles" is not verification for code that writes into a shop's
 * books. This server speaks the same protocol as the real thing — the OAuth
 * consent redirect, the token endpoint, the revoke endpoint and the six
 * Accounting API v3 routes lib/integrations/quickbooks.ts calls — so the whole
 * flow can be exercised end to end against it.
 *
 * It is NOT a mock inside the app. The app makes real HTTP requests, with real
 * bearer tokens, and only the hostnames differ:
 *
 *   QBO_AUTH_BASE=http://127.0.0.1:4310
 *   QBO_OAUTH_BASE=http://127.0.0.1:4310
 *   QBO_REVOKE_BASE=http://127.0.0.1:4310
 *   QBO_API_BASE=http://127.0.0.1:4310
 *
 * Run:  node scripts/dev/fake-quickbooks.mjs [port]
 *
 * Behaviour worth knowing:
 *   · DisplayName / Item Name uniqueness IS enforced, answering with a real
 *     6240 Fault — that is the path the " (RF-2)" retry ladder depends on.
 *   · Access tokens expire in 90 seconds, so the early-refresh margin gets
 *     exercised on any run longer than that.
 *   · `?fail=429` on any Accounting call answers 429 with Retry-After.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 4310);
const REALM_ID = "4620816365320000000";

/** Everything this fake company holds. Reset by restarting the process. */
const store = {
  codes: new Map(),      // code -> { redirectUri }
  tokens: new Map(),     // accessToken -> { expiresAt }
  refresh: new Set(),
  customer: new Map(),
  item: new Map(),
  invoice: new Map(),
  payment: new Map(),
  nextId: 1000,
};

const ACCOUNTS = [
  { Id: "79", Name: "Sales of Product Income", AccountType: "Income", AccountSubType: "SalesOfProductIncome" },
  { Id: "80", Name: "Services", AccountType: "Income", AccountSubType: "ServiceFeeIncome" },
];

function id() {
  return String(store.nextId++);
}

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

function fault(res, status, code, message, detail = "") {
  json(res, status, {
    Fault: { Error: [{ Message: message, Detail: detail, code }], type: "ValidationFault" },
    time: new Date().toISOString(),
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function issueTokens() {
  const accessToken = `qbo_at_${randomUUID()}`;
  const refreshToken = `qbo_rt_${randomUUID()}`;
  store.tokens.set(accessToken, { expiresAt: Date.now() + 90_000 });
  store.refresh.add(refreshToken);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 90,
    x_refresh_token_expires_in: 8_726_400,
  };
}

/** Every Accounting call must carry a live bearer token, exactly as Intuit's does. */
function authorized(req) {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const token = store.tokens.get(match[1]);
  return Boolean(token) && token.expiresAt > Date.now();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // --- OAuth consent -------------------------------------------------------
  if (path === "/connect/oauth2") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (!redirectUri || !state) {
      json(res, 400, { error: "invalid_request" });
      return;
    }
    const code = `qbo_code_${randomUUID()}`;
    store.codes.set(code, { redirectUri });

    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    back.searchParams.set("realmId", REALM_ID);
    res.writeHead(302, { Location: back.toString() });
    res.end();
    return;
  }

  // --- Token exchange / refresh -------------------------------------------
  if (path === "/oauth2/v1/tokens/bearer") {
    if (!/^Basic\s+/i.test(req.headers.authorization ?? "")) {
      json(res, 401, { error: "invalid_client" });
      return;
    }
    const params = new URLSearchParams(await readBody(req));
    const grant = params.get("grant_type");

    if (grant === "authorization_code") {
      const code = params.get("code");
      if (!code || !store.codes.has(code)) {
        json(res, 400, { error: "invalid_grant" });
        return;
      }
      store.codes.delete(code);
      json(res, 200, issueTokens());
      return;
    }

    if (grant === "refresh_token") {
      const token = params.get("refresh_token");
      if (!token || !store.refresh.has(token)) {
        json(res, 400, { error: "invalid_grant" });
        return;
      }
      // Intuit rotates the refresh token; so does this.
      store.refresh.delete(token);
      json(res, 200, issueTokens());
      return;
    }

    json(res, 400, { error: "unsupported_grant_type" });
    return;
  }

  if (path === "/v2/oauth2/tokens/revoke") {
    const body = JSON.parse((await readBody(req)) || "{}");
    store.refresh.delete(body.token);
    res.writeHead(200).end();
    return;
  }

  // --- Accounting API ------------------------------------------------------
  const api = /^\/v3\/company\/([^/]+)(\/.*)?$/.exec(path);
  if (api) {
    if (!authorized(req)) {
      json(res, 401, { Fault: { Error: [{ Message: "message=AuthenticationFailed" }] } });
      return;
    }
    if (url.searchParams.get("fail") === "429") {
      json(res, 429, { message: "Too many requests" }, { "Retry-After": "30" });
      return;
    }
    if (api[1] !== REALM_ID) {
      fault(res, 403, "3200", "message=ApplicationAuthenticationFailed", "unknown realm");
      return;
    }

    const resource = (api[2] ?? "").toLowerCase();
    const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : null;

    if (resource.startsWith("/companyinfo")) {
      json(res, 200, {
        CompanyInfo: { Id: REALM_ID, CompanyName: "Sandbox Company_US_1", LegalName: "Sandbox Company_US_1" },
      });
      return;
    }

    if (resource === "/query") {
      const statement = url.searchParams.get("query") ?? "";
      if (/from\s+Account/i.test(statement)) {
        json(res, 200, { QueryResponse: { Account: ACCOUNTS } });
        return;
      }
      if (/from\s+Item/i.test(statement)) {
        const name = /Name\s*=\s*'([^']*)'/i.exec(statement)?.[1];
        const found = [...store.item.values()].filter((item) => item.Name === name);
        json(res, 200, { QueryResponse: found.length ? { Item: found } : {} });
        return;
      }
      json(res, 200, { QueryResponse: {} });
      return;
    }

    if (resource === "/customer") return upsertNamed(res, "customer", "Customer", "DisplayName", body);
    if (resource === "/item") return upsertNamed(res, "item", "Item", "Name", body);

    if (resource === "/invoice") {
      if (url.searchParams.get("operation") === "void") {
        const existing = store.invoice.get(String(body.Id));
        if (!existing) {
          fault(res, 400, "6240", "Object Not Found", "invoice");
          return;
        }
        existing.SyncToken = String(Number(existing.SyncToken) + 1);
        existing.void = true;
        existing.PrivateNote = "Voided";
        json(res, 200, { Invoice: existing });
        return;
      }
      return create(res, "invoice", "Invoice", body);
    }

    if (resource === "/payment") return create(res, "payment", "Payment", body);

    fault(res, 404, "610", "Object Not Found", resource);
    return;
  }

  json(res, 404, { error: "not_found", path });
});

/**
 * Create-or-update for the two entities QuickBooks keys by a unique name.
 * The 6240 answer here is the whole reason the app has a retry ladder.
 */
function upsertNamed(res, bucket, wrapper, nameField, body) {
  const collection = store[bucket];

  if (body?.Id) {
    const existing = collection.get(String(body.Id));
    if (!existing) {
      fault(res, 400, "610", "Object Not Found", `${wrapper} ${body.Id}`);
      return;
    }
    if (String(body.SyncToken ?? "0") !== existing.SyncToken) {
      fault(res, 400, "5010", "Stale Object Error", "SyncToken mismatch");
      return;
    }
    Object.assign(existing, body, { SyncToken: String(Number(existing.SyncToken) + 1) });
    json(res, 200, { [wrapper]: existing });
    return;
  }

  const name = body?.[nameField];
  const clash = [...collection.values()].some((row) => row[nameField] === name);
  if (clash) {
    fault(res, 400, "6240", "Duplicate Name Exists Error", `The name supplied already exists. : ${name}`);
    return;
  }

  const created = { ...body, Id: id(), SyncToken: "0" };
  collection.set(created.Id, created);
  json(res, 200, { [wrapper]: created });
}

function create(res, bucket, wrapper, body) {
  const created = { ...body, Id: id(), SyncToken: "0" };
  store[bucket].set(created.Id, created);
  json(res, 200, { [wrapper]: created });
}

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `fake-quickbooks listening on http://127.0.0.1:${PORT} (realmId ${REALM_ID})\n`,
  );
});
