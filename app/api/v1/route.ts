import { NextResponse } from "next/server";

import { WEBHOOK_EVENTS } from "@/components/settings/webhook-meta";
import { RATE_LIMIT } from "./_lib/rate-limit";
import { CORS_HEADERS, PAGE_SIZE } from "./_lib/respond";

/**
 * GET /api/v1 — the discovery document.
 *
 * Unauthenticated on purpose: it describes the API's shape and reveals nothing
 * about any shop, so a developer holding a fresh key can confirm they have the
 * right base URL before they have anything to authenticate with.
 *
 * KEEP THIS IN STEP WITH THE ROUTES. It is the first thing anyone integrating
 * reads, and a discovery document that lists an endpoint which does not exist
 * is worse than no discovery document.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "RepairPilot API",
      version: "v1",
      auth: {
        scheme: "bearer",
        header: "Authorization: Bearer rfk_<40 hex characters>",
        obtain: "Settings → API keys → Create key (the key is shown once).",
        scope:
          "A key is bound to one shop. Every response contains only that shop's data.",
        permissions:
          "A key acts as an OWNER: it can read, create, update and delete anything in its shop. There are no per-key scopes in v1 — issue one key per integration and revoke it when the integration goes away.",
      },
      pagination: {
        pageSize: PAGE_SIZE,
        page: "?page=2 — simple, 1-based, and fine for browsing.",
        cursor:
          "?cursor=<next_cursor> — keyset pagination. Every list answers with `next_cursor`; pass it back to get the following page, and stop when it is null. Preferred for exports: rows created mid-walk cannot shift a page under you.",
        ordering: "createdAt descending, with id as the tiebreak.",
        envelope: {
          data: "[]",
          page: 1,
          totalPages: 1,
          total: 0,
          next_cursor: null,
        },
      },
      rateLimit: {
        limit: RATE_LIMIT,
        window: "1 minute, per API key",
        burst: `${RATE_LIMIT} requests, refilling continuously at ${RATE_LIMIT}/minute`,
        headers: [
          "X-RateLimit-Limit",
          "X-RateLimit-Remaining",
          "X-RateLimit-Reset",
        ],
        exceeded:
          "429 with `Retry-After` in seconds and an error code of `rate_limited`.",
      },
      cors: {
        allowOrigin: "*",
        allowMethods: "GET, POST, PATCH, DELETE, OPTIONS",
        allowHeaders: "Authorization, Content-Type",
        exposeHeaders:
          "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
        note: "No credentials are accepted, so a wildcard origin cannot be used to ride a cookie. Keep your key out of a public front-end regardless — it is an owner-level credential.",
      },
      errors: {
        envelope: { error: { code: "not_found", message: "…" } },
        codes: {
          unauthorized: "401 — missing, unknown or revoked key",
          invalid_request: "400 — the body or query failed validation",
          not_found:
            "404 — no such row in your shop (an id belonging to another shop answers 404, never 403)",
          rate_limited: "429 — too many requests for this key; see Retry-After",
          server_error: "500 — unexpected failure",
        },
      },
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/customers",
          query: ["page", "cursor", "q"],
        },
        { method: "POST", path: "/api/v1/customers" },
        { method: "GET", path: "/api/v1/customers/{id}" },
        {
          method: "PATCH",
          path: "/api/v1/customers/{id}",
          notes: "Send only the fields you want changed. `null` clears one.",
        },
        {
          method: "DELETE",
          path: "/api/v1/customers/{id}",
          notes:
            "Refused while the customer still has tickets, invoices or estimates.",
        },

        {
          method: "GET",
          path: "/api/v1/tickets",
          query: ["page", "cursor", "status", "customerId"],
        },
        { method: "POST", path: "/api/v1/tickets" },
        {
          method: "GET",
          path: "/api/v1/tickets/{id}",
          notes: "Includes public comments only; internal notes are never returned.",
        },
        {
          method: "PATCH",
          path: "/api/v1/tickets/{id}",
          notes:
            "Moving into the resolved status stamps resolvedAt; moving out clears it.",
        },
        {
          method: "DELETE",
          path: "/api/v1/tickets/{id}",
          notes: "Comments, charges, time entries and attachments go with it.",
        },

        {
          method: "GET",
          path: "/api/v1/invoices",
          query: ["page", "cursor", "status", "customerId"],
        },
        {
          method: "GET",
          path: "/api/v1/invoices/{id}",
          notes: "Includes lines, payments and computed totals in cents.",
        },
        {
          method: "PATCH",
          path: "/api/v1/invoices/{id}",
          notes: "notes, dueDate, and DRAFT → SENT. Lines are not patchable.",
        },
        {
          method: "DELETE",
          path: "/api/v1/invoices/{id}",
          notes:
            "VOIDS the invoice rather than removing it — a numbered document is never deleted. Refused once payments exist.",
        },

        {
          method: "GET",
          path: "/api/v1/payments",
          query: ["page", "cursor", "invoiceId", "since"],
        },
        {
          method: "POST",
          path: "/api/v1/payments",
          notes:
            "Records a manual payment against an invoice and restates it, exactly as the counter does. CREDIT draws down store credit.",
        },

        {
          method: "GET",
          path: "/api/v1/estimates",
          query: ["page", "cursor", "status", "customerId"],
        },
        { method: "POST", path: "/api/v1/estimates", notes: "Always created DRAFT." },
        { method: "GET", path: "/api/v1/estimates/{id}" },
        {
          method: "PATCH",
          path: "/api/v1/estimates/{id}",
          notes:
            "notes, expiresAt, and DRAFT → SENT. Approval and decline are the customer's act, not an integration's.",
        },

        {
          method: "GET",
          path: "/api/v1/products",
          query: ["page", "cursor", "q", "category", "active"],
        },
        { method: "POST", path: "/api/v1/products" },
        { method: "GET", path: "/api/v1/products/{id}" },
        {
          method: "PATCH",
          path: "/api/v1/products/{id}",
          notes: "No DELETE — set `active: false`, which is what the UI does.",
        },

        {
          method: "GET",
          path: "/api/v1/leads",
          query: ["page", "cursor", "status"],
        },
        { method: "POST", path: "/api/v1/leads" },
        { method: "GET", path: "/api/v1/leads/{id}" },
        { method: "PATCH", path: "/api/v1/leads/{id}" },
        { method: "DELETE", path: "/api/v1/leads/{id}" },

        {
          method: "GET",
          path: "/api/v1/appointments",
          query: ["page", "cursor", "status", "from", "to", "customerId"],
        },
        { method: "POST", path: "/api/v1/appointments" },
        { method: "GET", path: "/api/v1/appointments/{id}" },
        { method: "PATCH", path: "/api/v1/appointments/{id}" },
        { method: "DELETE", path: "/api/v1/appointments/{id}" },
      ],
      webhooks: {
        configure: "Settings → API keys → Webhooks",
        events: WEBHOOK_EVENTS,
        wildcard: "* subscribes to every event, including ones added later.",
        signature:
          "X-RepairPilot-Signature: t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}` using the hook's secret>",
        delivery:
          "X-RepairPilot-Delivery is the idempotency key; a retry repeats it. Answer 2xx to acknowledge. Retries: 1m, 5m, 30m, 2h, 12h.",
      },
      conventions: {
        money: "Every amount is an integer number of cents.",
        taxRates: "Basis points — 825 means 8.25%.",
        dates: "ISO 8601 UTC strings.",
        additive:
          "Fields may be ADDED to a v1 payload, never removed or retyped. Ignore keys you do not recognise.",
      },
    },
    { headers: { "Cache-Control": "no-store", ...CORS_HEADERS } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
