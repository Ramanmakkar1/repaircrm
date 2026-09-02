#!/usr/bin/env node
/**
 * A stand-in Xero, for development only. Sibling of fake-quickbooks.mjs — see
 * that file's header for why these exist.
 *
 * Speaks the endpoints lib/integrations/xero.ts calls: the identity consent
 * redirect, the token endpoint, GET /connections, and the Contacts, Items,
 * Invoices and Payments resources of Accounting API 2.0.
 *
 *   XERO_LOGIN_BASE=http://127.0.0.1:4311
 *   XERO_IDENTITY_BASE=http://127.0.0.1:4311
 *   XERO_API_BASE=http://127.0.0.1:4311
 *
 * Run:  node scripts/dev/fake-xero.mjs [port] [tenantCount]
 *
 * `tenantCount` defaults to 1. Pass 2 to exercise the organisation picker —
 * the branch that exists so a shop's invoices never land in a different
 * client's books.
 *
 * Behaviour worth knowing:
 *   · Contact Name and Item Code uniqueness ARE enforced, with Xero's own
 *     ValidationErrors shape — the " (RF-2)" ladder depends on it.
 *   · Every Accounting call requires the Xero-Tenant-Id header, and refuses a
 *     tenant this grant does not cover.
 *   · Access tokens expire in 90 seconds, exercising the refresh margin.
 *   · `?fail=429` on any Accounting call answers 429 with Retry-After.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 4311);
const TENANT_COUNT = Math.max(1, Number(process.argv[3] ?? 1));

const TENANTS = Array.from({ length: TENANT_COUNT }, (_, index) => ({
  id: randomUUID(),
  tenantId: `00000000-0000-4000-8000-00000000000${index + 1}`,
  tenantType: "ORGANISATION",
  tenantName: index === 0 ? "Demo Company (Global)" : `Second Organisation ${index}`,
}));

const store = {
  codes: new Map(),
  tokens: new Map(),
  refresh: new Set(),
  contacts: new Map(),
  items: new Map(),
  invoices: new Map(),
  payments: new Map(),
};

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

function validationError(res, message) {
  json(res, 400, {
    ErrorNumber: 10,
    Type: "ValidationException",
    Message: "A validation exception occurred",
    Elements: [{ ValidationErrors: [{ Message: message }] }],
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
  const accessToken = `xero_at_${randomUUID()}`;
  const refreshToken = `xero_rt_${randomUUID()}`;
  store.tokens.set(accessToken, { expiresAt: Date.now() + 90_000 });
  store.refresh.add(refreshToken);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: `xero_id_${randomUUID()}`,
    token_type: "Bearer",
    expires_in: 90,
    scope:
      "openid profile email accounting.transactions accounting.contacts offline_access",
  };
}

function authorized(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
  if (!match) return false;
  const token = store.tokens.get(match[1]);
  return Boolean(token) && token.expiresAt > Date.now();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // --- Consent -------------------------------------------------------------
  if (path === "/identity/connect/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (!redirectUri || !state) {
      json(res, 400, { error: "invalid_request" });
      return;
    }
    const code = `xero_code_${randomUUID()}`;
    store.codes.set(code, true);

    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    res.writeHead(302, { Location: back.toString() });
    res.end();
    return;
  }

  // --- Token exchange / refresh -------------------------------------------
  if (path === "/connect/token") {
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
      store.refresh.delete(token);
      json(res, 200, issueTokens());
      return;
    }

    json(res, 400, { error: "unsupported_grant_type" });
    return;
  }

  // --- Connections ---------------------------------------------------------
  if (path === "/connections") {
    if (!authorized(req)) {
      json(res, 401, { Title: "Unauthorized" });
      return;
    }
    json(res, 200, TENANTS);
    return;
  }

  // --- Accounting API ------------------------------------------------------
  if (path.startsWith("/api.xro/2.0/")) {
    if (!authorized(req)) {
      json(res, 401, { Title: "Unauthorized", Detail: "TokenExpired" });
      return;
    }

    const tenantId = req.headers["xero-tenant-id"];
    if (!tenantId) {
      json(res, 400, { Type: "ValidationException", Detail: "Xero-Tenant-Id header is required" });
      return;
    }
    if (!TENANTS.some((tenant) => tenant.tenantId === tenantId)) {
      json(res, 403, { Title: "Forbidden", Detail: "AuthenticationUnsuccessful" });
      return;
    }
    if (url.searchParams.get("fail") === "429") {
      json(res, 429, { Type: "RateLimitException" }, { "Retry-After": "30" });
      return;
    }

    const resource = path.slice("/api.xro/2.0/".length);
    const body = req.method === "GET" ? null : JSON.parse((await readBody(req)) || "{}");

    if (resource === "Contacts") {
      const input = body.Contacts?.[0] ?? {};
      if (input.ContactID) {
        const existing = store.contacts.get(input.ContactID);
        if (!existing) {
          validationError(res, "Contact not found");
          return;
        }
        Object.assign(existing, input);
        json(res, 200, { Contacts: [existing] });
        return;
      }
      const clash = [...store.contacts.values()].some((row) => row.Name === input.Name);
      if (clash) {
        validationError(res, "Contact name must be unique across all active contacts.");
        return;
      }
      const created = { ...input, ContactID: randomUUID(), ContactStatus: "ACTIVE" };
      store.contacts.set(created.ContactID, created);
      json(res, 200, { Contacts: [created] });
      return;
    }

    if (resource === "Items") {
      const input = body.Items?.[0] ?? {};
      if (input.ItemID) {
        const existing = store.items.get(input.ItemID);
        if (!existing) {
          validationError(res, "Item not found");
          return;
        }
        Object.assign(existing, input);
        json(res, 200, { Items: [existing] });
        return;
      }
      const clash = [...store.items.values()].some((row) => row.Code === input.Code);
      if (clash) {
        validationError(res, `The item code ${input.Code} is already in use.`);
        return;
      }
      const created = { ...input, ItemID: randomUUID() };
      store.items.set(created.ItemID, created);
      json(res, 200, { Items: [created] });
      return;
    }

    if (resource === "Invoices") {
      const input = body.Invoices?.[0] ?? {};
      const created = { ...input, InvoiceID: randomUUID() };
      store.invoices.set(created.InvoiceID, created);
      json(res, 200, { Invoices: [created] });
      return;
    }

    if (resource.startsWith("Invoices/")) {
      const invoiceId = resource.slice("Invoices/".length);
      const existing = store.invoices.get(invoiceId);
      if (!existing) {
        validationError(res, "Invoice not found");
        return;
      }
      Object.assign(existing, body.Invoices?.[0] ?? {});
      json(res, 200, { Invoices: [existing] });
      return;
    }

    if (resource === "Payments") {
      const input = body.Payments?.[0] ?? {};
      if (!store.invoices.has(input.Invoice?.InvoiceID)) {
        validationError(res, "Invoice not found or not of valid status for modification.");
        return;
      }
      const created = { ...input, PaymentID: randomUUID(), Status: "AUTHORISED" };
      store.payments.set(created.PaymentID, created);
      json(res, 200, { Payments: [created] });
      return;
    }

    json(res, 404, { Title: "Not Found", Detail: resource });
    return;
  }

  json(res, 404, { Title: "Not Found", Detail: path });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `fake-xero listening on http://127.0.0.1:${PORT} (${TENANTS.length} organisation${TENANTS.length === 1 ? "" : "s"})\n`,
  );
});
