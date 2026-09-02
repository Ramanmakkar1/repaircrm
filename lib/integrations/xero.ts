import { db } from "@/lib/db";

import { xeroApiBase } from "./config";
import {
  IntegrationApiError,
  IntegrationAuthError,
  IntegrationRateLimitError,
  retryAfterMs,
  type LiveConnection,
} from "./oauth";
import { loadLinks, saveLink, type Link } from "./links";
import {
  MAX_ROWS_PER_ENTITY,
  type ConnectionSettings,
  type SyncResult,
} from "./types";

/**
 * Xero — Accounting API 2.0.
 *
 * Endpoints used, all under `{apiBase}/api.xro/2.0`:
 *
 *   POST /Contacts            create + update (ContactID present = update)
 *   POST /Items               create + update
 *   POST /Invoices            create, Type ACCREC, Status AUTHORISED
 *   POST /Invoices/{id}       Status VOIDED, for an invoice voided here
 *   PUT  /Payments            a payment applied to an invoice
 *
 * Plus `GET {apiBase}/connections`, outside the Accounting API, which is how a
 * grant is turned into the tenant (organisation) it covers.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS XERO DOES DIFFERENTLY FROM QUICKBOOKS
 * ---------------------------------------------------------------------------
 * 1. `Xero-Tenant-Id` on EVERY call. One access token can reach several
 *    organisations, and the header is the only thing that says which — omit it
 *    and the call fails, get it wrong and you have just written a repair
 *    invoice into somebody else's books. It is set in one place below.
 *
 * 2. Accounts are codes, not ids. A line needs a sales account code and a
 *    payment needs a bank account code, both from the organisation's own chart
 *    of accounts. "200" (Sales) and "090" (Business Bank Account) are the Xero
 *    demo-company defaults and therefore the defaults here, but every
 *    organisation is free to renumber, so both are editable on the settings
 *    card and stored per connection.
 * ---------------------------------------------------------------------------
 */

type Json = Record<string, unknown>;

export const DEFAULT_SALES_ACCOUNT_CODE = "200";
export const DEFAULT_BANK_ACCOUNT_CODE = "090";

/** Xero's own tax types for "this line is taxed" and "this line is not". */
const TAX_OUTPUT = "OUTPUT";
const TAX_NONE = "NONE";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Target = { accessToken: string; tenantId: string };

async function xeroFetch(
  target: Target | { accessToken: string; tenantId?: undefined },
  path: string,
  init: { method?: string; body?: Json } = {},
): Promise<Json> {
  const response = await fetch(`${xeroApiBase()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${target.accessToken}`,
      Accept: "application/json",
      ...(target.tenantId ? { "Xero-Tenant-Id": target.tenantId } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();

  if (response.status === 401) {
    throw new IntegrationAuthError(
      "Xero rejected the access token. Reconnect the organisation.",
    );
  }
  if (response.status === 429) {
    throw new IntegrationRateLimitError(
      "Xero is rate limiting this app.",
      retryAfterMs(response.headers.get("retry-after")),
    );
  }
  if (!response.ok) {
    throw new IntegrationApiError(response.status, validationMessage(text) ?? text);
  }

  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    // GET /connections answers with a bare array; everything else an object.
    return Array.isArray(parsed) ? { items: parsed } : (parsed as Json);
  } catch {
    throw new IntegrationApiError(response.status, text);
  }
}

/**
 * Xero puts the useful half of an error two levels down, in
 * `Elements[].ValidationErrors[].Message`, and the generic half at the top in
 * `Detail`. Both are tried so a card never shows a bare "HTTP 400".
 */
function validationMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      Detail?: string;
      Message?: string;
      Elements?: { ValidationErrors?: { Message?: string }[] }[];
      ValidationErrors?: { Message?: string }[];
    };
    const nested =
      parsed.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).filter(Boolean) ??
      parsed.ValidationErrors?.map((e) => e.Message).filter(Boolean) ??
      [];
    if (nested.length > 0) return nested.join("; ");
    return parsed.Detail ?? parsed.Message ?? null;
  } catch {
    return null;
  }
}

function isDuplicateName(error: unknown): boolean {
  return (
    error instanceof IntegrationApiError &&
    /contact name must be unique|already exists/i.test(error.body)
  );
}

function isDuplicateCode(error: unknown): boolean {
  return (
    error instanceof IntegrationApiError &&
    /code.*(already|unique)|item code/i.test(error.body)
  );
}

// ---------------------------------------------------------------------------
// Connect helpers
// ---------------------------------------------------------------------------

export type XeroTenant = { tenantId: string; tenantName: string };

/**
 * The organisations this grant covers.
 *
 * A Xero user with a bookkeeping practice routinely authorises several at
 * once, which is why the callback shows a picker instead of guessing: writing
 * a shop's invoices into the wrong organisation is not something a Disconnect
 * button undoes.
 */
export async function fetchXeroTenants(
  accessToken: string,
): Promise<XeroTenant[]> {
  const response = await xeroFetch({ accessToken }, "/connections");
  const items = (response.items as Json[] | undefined) ?? [];
  return items
    .filter((item) => !item.tenantType || item.tenantType === "ORGANISATION")
    .map((item) => ({
      tenantId: String(item.tenantId ?? ""),
      tenantName: String(item.tenantName ?? "Xero organisation"),
    }))
    .filter((tenant) => tenant.tenantId !== "");
}

// ---------------------------------------------------------------------------
// The sync pass
// ---------------------------------------------------------------------------

function money(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function salesAccountCode(settings: ConnectionSettings): string {
  return settings.xeroSalesAccountCode?.trim() || DEFAULT_SALES_ACCOUNT_CODE;
}

export function bankAccountCode(settings: ConnectionSettings): string {
  return settings.xeroBankAccountCode?.trim() || DEFAULT_BANK_ACCOUNT_CODE;
}

/**
 * Pushes everything this shop owes Xero, in dependency order.
 * Same contract as the QuickBooks pass: mutates `result`, swallows a bad row,
 * rethrows auth and rate-limit failures because both end the whole run.
 */
export async function syncXero(
  connection: LiveConnection,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const settings = connection.settings;

  await syncContacts(connection, result, watermark);
  await syncItems(connection, settings, result, watermark);
  await syncInvoices(connection, settings, result, watermark);
  await syncPayments(connection, settings, result);
}

// --- Contacts --------------------------------------------------------------

type CustomerRow = Awaited<ReturnType<typeof db.customer.findMany>>[number];

function contactBody(row: CustomerRow, name: string): Json {
  const body: Json = {
    Name: name.slice(0, 255),
    FirstName: row.firstName.slice(0, 255),
    LastName: row.lastName.slice(0, 255),
  };
  if (row.email) body.EmailAddress = row.email;
  const phone = row.phone ?? row.mobile;
  if (phone) body.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: phone.slice(0, 50) }];
  if (row.address1 || row.city || row.postalCode) {
    body.Addresses = [
      {
        AddressType: "STREET",
        AddressLine1: row.address1 ?? undefined,
        AddressLine2: row.address2 ?? undefined,
        City: row.city ?? undefined,
        Region: row.state ?? undefined,
        PostalCode: row.postalCode ?? undefined,
        Country: row.country ?? undefined,
      },
    ];
  }
  return body;
}

async function syncContacts(
  connection: LiveConnection,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const links = await loadLinks(connection.shopId, "xero", "customer");
  const rows = await db.customer.findMany({
    where: changedOrUnlinked(connection.shopId, links, watermark),
    orderBy: { updatedAt: "asc" },
    take: MAX_ROWS_PER_ENTITY,
  });

  const bucket = result.entities.customer;

  for (const row of rows) {
    const link = links.get(row.id);
    if (link && row.updatedAt <= link.syncedAt) {
      bucket.skipped += 1;
      continue;
    }

    try {
      if (link) {
        // Push a local rename through, but keep the name Xero already accepted
        // if the new one clashes — a stale contact name is cosmetic, a contact
        // whose invoices stop syncing is not.
        const name = await withNameFallback(
          [row.firstName, row.lastName].filter(Boolean).join(" ").trim(),
          link.meta.remoteName,
          async (candidate) => {
            await xeroFetch(connection, "/api.xro/2.0/Contacts", {
              method: "POST",
              body: {
                Contacts: [
                  { ContactID: link.remoteId, ...contactBody(row, candidate) },
                ],
              },
            });
          },
        );
        await saveLink(connection.shopId, "xero", "customer", row.id, link.remoteId, {
          ...link.meta,
          remoteName: name,
        });
        bucket.updated += 1;
      } else {
        await createContact(connection, row);
        bucket.created += 1;
      }
    } catch (error) {
      rethrowFatal(error);
      bucket.failed += 1;
      result.errors.push(
        `customer ${row.firstName} ${row.lastName}: ${short(error)}`,
      );
    }
  }
}

/**
 * Contact Name is unique across active contacts in a Xero organisation, and
 * two "John Smith"s in a repair shop is normal. Same ladder QuickBooks gets:
 * the real name first, then " (RF-2)", " (RF-3)" …, and the accepted name is
 * stored on the link so updates keep addressing the same contact.
 */
async function createContact(
  connection: LiveConnection,
  row: CustomerRow,
): Promise<void> {
  const base =
    [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
    row.businessName ||
    row.email ||
    "Customer";

  for (let attempt = 1; attempt <= 6; attempt++) {
    const name = attempt === 1 ? base : `${base} (RF-${attempt})`;
    try {
      const response = await xeroFetch(connection, "/api.xro/2.0/Contacts", {
        method: "POST",
        body: { Contacts: [contactBody(row, name)] },
      });
      const created = (response.Contacts as Json[] | undefined)?.[0];
      if (!created?.ContactID) {
        throw new Error("Xero did not return the created contact.");
      }
      await saveLink(
        connection.shopId,
        "xero",
        "customer",
        row.id,
        String(created.ContactID),
        { remoteName: name },
      );
      return;
    } catch (error) {
      if (!isDuplicateName(error)) throw error;
    }
  }

  throw new Error(
    `Xero already has contacts named "${base}" and five variations of it — rename one in Xero.`,
  );
}

// --- Items -----------------------------------------------------------------

type ProductRow = Awaited<ReturnType<typeof db.product.findMany>>[number];

/**
 * Xero identifies an item by `Code`, which is required, unique, and capped at
 * 30 characters. The shop's own SKU is used when it has one; otherwise a
 * stable code is derived from the local id, so re-running the sync after a
 * failure addresses the same item rather than minting a second one.
 */
function itemCode(row: ProductRow): string {
  const source = row.sku?.trim() || `RF-${row.id.slice(-10).toUpperCase()}`;
  return source.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 30);
}

async function syncItems(
  connection: LiveConnection,
  settings: ConnectionSettings,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const links = await loadLinks(connection.shopId, "xero", "product");
  const rows = await db.product.findMany({
    where: changedOrUnlinked(connection.shopId, links, watermark),
    orderBy: { updatedAt: "asc" },
    take: MAX_ROWS_PER_ENTITY,
  });
  if (rows.length === 0) return;

  const bucket = result.entities.product;
  const account = salesAccountCode(settings);

  for (const row of rows) {
    const link = links.get(row.id);
    if (link && row.updatedAt <= link.syncedAt) {
      bucket.skipped += 1;
      continue;
    }

    const body: Json = {
      Name: row.name.slice(0, 50),
      Description: row.description?.slice(0, 4000) ?? undefined,
      IsSold: true,
      IsPurchased: false,
      SalesDetails: {
        UnitPrice: money(row.priceCents),
        AccountCode: account,
        TaxType: row.taxable ? TAX_OUTPUT : TAX_NONE,
      },
    };

    try {
      if (link) {
        await xeroFetch(connection, "/api.xro/2.0/Items", {
          method: "POST",
          body: {
            Items: [
              {
                ItemID: link.remoteId,
                Code: link.meta.code ?? itemCode(row),
                ...body,
              },
            ],
          },
        });
        await saveLink(connection.shopId, "xero", "product", row.id, link.remoteId, {
          ...link.meta,
        });
        bucket.updated += 1;
      } else {
        await createItem(connection, row, body);
        bucket.created += 1;
      }
    } catch (error) {
      rethrowFatal(error);
      bucket.failed += 1;
      result.errors.push(`product ${row.name}: ${short(error)}`);
    }
  }
}

async function createItem(
  connection: LiveConnection,
  row: ProductRow,
  body: Json,
): Promise<void> {
  const base = itemCode(row);

  for (let attempt = 1; attempt <= 6; attempt++) {
    const code =
      attempt === 1 ? base : `${base.slice(0, 26)}-${attempt}`.slice(0, 30);
    try {
      const response = await xeroFetch(connection, "/api.xro/2.0/Items", {
        method: "POST",
        body: { Items: [{ Code: code, ...body }] },
      });
      const created = (response.Items as Json[] | undefined)?.[0];
      if (!created?.ItemID) throw new Error("Xero did not return the created item.");
      await saveLink(
        connection.shopId,
        "xero",
        "product",
        row.id,
        String(created.ItemID),
        { code },
      );
      return;
    } catch (error) {
      if (!isDuplicateCode(error)) throw error;
    }
  }

  throw new Error(
    `Xero already has items with the code "${base}" and five variations of it — change this product's SKU.`,
  );
}

// --- Invoices --------------------------------------------------------------

const PUSHABLE = ["SENT", "PARTIAL", "PAID"] as const;

async function syncInvoices(
  connection: LiveConnection,
  settings: ConnectionSettings,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const [invoiceLinks, contactLinks, itemLinks] = await Promise.all([
    loadLinks(connection.shopId, "xero", "invoice"),
    loadLinks(connection.shopId, "xero", "customer"),
    loadLinks(connection.shopId, "xero", "product"),
  ]);

  const rows = await db.invoice.findMany({
    where: {
      ...changedOrUnlinked(connection.shopId, invoiceLinks, watermark),
      status: { in: [...PUSHABLE, "VOID"] },
    },
    orderBy: { updatedAt: "asc" },
    take: MAX_ROWS_PER_ENTITY,
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (rows.length === 0) return;

  const bucket = result.entities.invoice;
  const account = salesAccountCode(settings);

  for (const row of rows) {
    const link = invoiceLinks.get(row.id);

    if (row.status === "VOID") {
      if (!link || link.meta.voidedAt) {
        bucket.skipped += 1;
        continue;
      }
      try {
        await xeroFetch(
          connection,
          `/api.xro/2.0/Invoices/${encodeURIComponent(link.remoteId)}`,
          {
            method: "POST",
            body: {
              Invoices: [{ InvoiceID: link.remoteId, Status: "VOIDED" }],
            },
          },
        );
        await saveLink(connection.shopId, "xero", "invoice", row.id, link.remoteId, {
          ...link.meta,
          voidedAt: new Date().toISOString(),
        });
        bucket.updated += 1;
      } catch (error) {
        rethrowFatal(error);
        bucket.failed += 1;
        result.errors.push(`invoice #${row.number} void: ${short(error)}`);
      }
      continue;
    }

    if (link) {
      bucket.skipped += 1;
      continue;
    }

    const contactLink = contactLinks.get(row.customerId);
    if (!contactLink) {
      bucket.skipped += 1;
      continue;
    }

    try {
      const LineItems = row.lines.map((line) => {
        const itemLink = line.productId ? itemLinks.get(line.productId) : undefined;
        return {
          Description: line.description.slice(0, 4000),
          Quantity: line.quantity,
          UnitAmount: money(line.unitPriceCents),
          AccountCode: account,
          ItemCode: itemLink?.meta.code,
          // Per line: a repair invoice mixes a taxable part with untaxed
          // labour, and one blanket rate would misstate both halves.
          TaxType: line.taxable ? TAX_OUTPUT : TAX_NONE,
        };
      });

      const response = await xeroFetch(connection, "/api.xro/2.0/Invoices", {
        method: "POST",
        body: {
          Invoices: [
            {
              Type: "ACCREC",
              Contact: { ContactID: contactLink.remoteId },
              InvoiceNumber: `INV-${row.number}`,
              Reference: row.notes?.slice(0, 255) ?? undefined,
              Date: day(row.createdAt),
              DueDate: row.dueDate ? day(row.dueDate) : undefined,
              // Exclusive: our unit prices are pre-tax and the tax sits on top,
              // which is exactly how lib/money.ts computes a total.
              LineAmountTypes: "Exclusive",
              LineItems,
              // AUTHORISED, never DRAFT — a DRAFT invoice cannot take a
              // payment, and the payment for it is landing in the same pass.
              Status: "AUTHORISED",
            },
          ],
        },
      });

      const created = (response.Invoices as Json[] | undefined)?.[0];
      if (!created?.InvoiceID) {
        throw new Error("Xero did not return the created invoice.");
      }
      await saveLink(
        connection.shopId,
        "xero",
        "invoice",
        row.id,
        String(created.InvoiceID),
      );
      bucket.created += 1;
    } catch (error) {
      rethrowFatal(error);
      bucket.failed += 1;
      result.errors.push(`invoice #${row.number}: ${short(error)}`);
    }
  }
}

// --- Payments --------------------------------------------------------------

/** Link-driven, for the same reason as QuickBooks — see quickbooks.ts. */
async function syncPayments(
  connection: LiveConnection,
  settings: ConnectionSettings,
  result: SyncResult,
): Promise<void> {
  const [paymentLinks, invoiceLinks] = await Promise.all([
    loadLinks(connection.shopId, "xero", "payment"),
    loadLinks(connection.shopId, "xero", "invoice"),
  ]);

  const linkedInvoiceIds = [...invoiceLinks.keys()];
  if (linkedInvoiceIds.length === 0) return;

  const rows = await db.payment.findMany({
    where: {
      shopId: connection.shopId,
      invoiceId: { in: linkedInvoiceIds },
      id: { notIn: [...paymentLinks.keys()] },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS_PER_ENTITY,
    include: { invoice: { select: { number: true } } },
  });

  const bucket = result.entities.payment;
  const account = bankAccountCode(settings);

  for (const row of rows) {
    const invoiceLink = invoiceLinks.get(row.invoiceId);
    if (!invoiceLink) {
      bucket.skipped += 1;
      continue;
    }

    try {
      const response = await xeroFetch(connection, "/api.xro/2.0/Payments", {
        method: "PUT",
        body: {
          Payments: [
            {
              Invoice: { InvoiceID: invoiceLink.remoteId },
              Account: { Code: account },
              Date: day(row.createdAt),
              Amount: money(row.amountCents),
              Reference: row.reference?.slice(0, 255) ?? row.method,
            },
          ],
        },
      });
      const created = (response.Payments as Json[] | undefined)?.[0];
      if (!created?.PaymentID) {
        throw new Error("Xero did not return the created payment.");
      }
      await saveLink(
        connection.shopId,
        "xero",
        "payment",
        row.id,
        String(created.PaymentID),
      );
      bucket.created += 1;
    } catch (error) {
      rethrowFatal(error);
      bucket.failed += 1;
      result.errors.push(
        `payment on invoice #${row.invoice.number}: ${short(error)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared selection + error helpers
// ---------------------------------------------------------------------------

function changedOrUnlinked(
  shopId: string,
  links: Map<string, Link>,
  watermark: Date | null,
): { shopId: string; OR?: object[] } {
  if (!watermark) return { shopId };
  return {
    shopId,
    OR: [
      { id: { notIn: [...links.keys()] } },
      { updatedAt: { gt: watermark } },
    ],
  };
}

function rethrowFatal(error: unknown): void {
  if (
    error instanceof IntegrationAuthError ||
    error instanceof IntegrationRateLimitError
  ) {
    throw error;
  }
}

/** Tries the name we want, then the name Xero already accepted. */
async function withNameFallback(
  preferred: string,
  accepted: string | undefined,
  attempt: (name: string) => Promise<void>,
): Promise<string> {
  try {
    await attempt(preferred);
    return preferred;
  } catch (error) {
    if (!isDuplicateName(error) || !accepted || accepted === preferred) throw error;
    await attempt(accepted);
    return accepted;
  }
}

function short(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}
