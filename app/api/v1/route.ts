import { NextResponse } from "next/server";

import { PAGE_SIZE } from "./_lib/respond";

/**
 * GET /api/v1 — the discovery document.
 *
 * Unauthenticated on purpose: it describes the API's shape and reveals nothing
 * about any shop, so a developer holding a fresh key can confirm they have the
 * right base URL before they have anything to authenticate with.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "RepairFlow API",
      version: "v1",
      auth: {
        scheme: "bearer",
        header: "Authorization: Bearer rfk_<40 hex characters>",
        obtain: "Settings → API keys → Create key (the key is shown once).",
        scope:
          "A key is bound to one shop. Every response contains only that shop's data.",
      },
      pagination: {
        parameter: "page",
        pageSize: PAGE_SIZE,
        envelope: { data: "[]", page: 1, totalPages: 1, total: 0 },
      },
      errors: {
        envelope: { error: { code: "not_found", message: "…" } },
        codes: {
          unauthorized: "401 — missing, unknown or revoked key",
          invalid_request: "400 — the body or query failed validation",
          not_found:
            "404 — no such row in your shop (an id belonging to another shop answers 404, never 403)",
          server_error: "500 — unexpected failure",
        },
      },
      endpoints: [
        { method: "GET", path: "/api/v1/customers", query: ["page", "q"] },
        {
          method: "POST",
          path: "/api/v1/customers",
          body: {
            firstName: "string (required)",
            lastName: "string (required)",
            businessName: "string (optional)",
            email: "string (optional)",
            phone: "string (optional)",
          },
        },
        { method: "GET", path: "/api/v1/customers/{id}" },
        { method: "GET", path: "/api/v1/tickets", query: ["page", "status"] },
        {
          method: "GET",
          path: "/api/v1/tickets/{id}",
          notes: "Includes public comments only; internal notes are never returned.",
        },
        {
          method: "POST",
          path: "/api/v1/tickets",
          body: {
            customerId: "string (required)",
            subject: "string (required)",
            problemType: "string (required)",
            priority: "LOW | NORMAL | HIGH | URGENT (optional, default NORMAL)",
          },
          notes: "The ticket number is allocated by the shop's sequence.",
        },
        { method: "GET", path: "/api/v1/invoices", query: ["page", "status"] },
        {
          method: "GET",
          path: "/api/v1/invoices/{id}",
          notes: "Includes lines, payments and computed totals in cents.",
        },
      ],
      conventions: {
        money: "Every amount is an integer number of cents.",
        taxRates: "Basis points — 825 means 8.25%.",
        dates: "ISO 8601 UTC strings.",
      },
      notImplemented: [
        "rate limiting and per-key quotas",
        "CORS (server-to-server only today)",
        "webhooks",
        "PATCH / DELETE — v1 is read-mostly, with create-only writes",
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
