import { db } from "@/lib/db";
import { calcTotals } from "@/lib/money";

import {
  QBO_MINOR_VERSION,
  qboApiBase,
  qboClientId,
  qboClientSecret,
  qboRevokeBase,
} from "./config";
import {
  IntegrationApiError,
  IntegrationAuthError,
  IntegrationRateLimitError,
  mergeConnectionSettings,
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
 * QuickBooks Online — Accounting API v3.
 *
 * Endpoints used, all under `{apiBase}/v3/company/{realmId}` with
 * `?minorversion=75`:
 *
 *   GET  /companyinfo/{realmId}   the company name shown on the settings card
 *   GET  /query?query=…           account lookup (an Income account for Items)
 *   POST /customer                create + sparse update
 *   POST /item                    create + sparse update
 *   POST /invoice                 create, and `?operation=void` to void
 *   POST /payment                 create, linked to the invoice via LinkedTxn
 *
 * WHAT IS AND IS NOT PUSHED
 *   Invoices only in SENT / PARTIAL / PAID. A DRAFT is not a document yet, and
 *   a VOID that was never pushed has nothing to void — pushing either would
 *   put a number in a shop's books that its own screen does not show.
 *   An invoice that WAS pushed and has since been voided is voided in
 *   QuickBooks, because leaving it is the version of this bug that costs money.
 *
 * IDEMPOTENCY is entirely IntegrationLink's job (see links.ts): a row with a
 * link has been written, a row without one has not, and the unique index makes
 * a double-write impossible even when two passes overlap.
 */

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Target = { accessToken: string; tenantId: string };

/**
 * One call to the Accounting API.
 *
 * Failures are sorted into the three kinds a caller can actually act on:
 * 401 means reconnect, 429 means come back later, everything else means this
 * one row is bad and the next row should still be tried.
 */
async function qboFetch(
  target: Target,
  path: string,
  init: { method?: string; body?: Json; query?: Record<string, string> } = {},
): Promise<Json> {
  const url = new URL(
    `${qboApiBase()}/v3/company/${encodeURIComponent(target.tenantId)}${path}`,
  );
  url.searchParams.set("minorversion", QBO_MINOR_VERSION);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${target.accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();

  if (response.status === 401) {
    throw new IntegrationAuthError(
      "QuickBooks rejected the access token. Reconnect the company.",
    );
  }
  if (response.status === 429) {
    throw new IntegrationRateLimitError(
      "QuickBooks is rate limiting this app.",
      retryAfterMs(response.headers.get("retry-after")),
    );
  }
  if (!response.ok) {
    throw new IntegrationApiError(response.status, faultMessage(text) ?? text);
  }

  if (!text) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new IntegrationApiError(response.status, text);
  }
}

/** Pulls the human half out of a QuickBooks Fault payload. */
function faultMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] };
    };
    const first = parsed.Fault?.Error?.[0];
    if (!first) return null;
    return [first.Message, first.Detail].filter(Boolean).join(" — ") || null;
  } catch {
    return null;
  }
}

/** The QuickBooks error code, when the body carries one. "6240" = duplicate name. */
function faultCode(error: unknown): string | null {
  if (!(error instanceof IntegrationApiError)) return null;
  const match = /\b(\d{4,5})\b/.exec(error.body);
  return match ? match[1] : null;
}

/** True for the "Duplicate Name Exists Error" QuickBooks raises on DisplayName. */
function isDuplicateName(error: unknown): boolean {
  if (!(error instanceof IntegrationApiError)) return false;
  return faultCode(error) === "6240" || /duplicate name/i.test(error.body);
}

async function query(target: Target, statement: string): Promise<Json> {
  const response = await qboFetch(target, "/query", { query: { query: statement } });
  const result = response.QueryResponse;
  return (result && typeof result === "object" ? result : {}) as Json;
}

// ---------------------------------------------------------------------------
// Connect / disconnect helpers
// ---------------------------------------------------------------------------

/**
 * The company's own name, fetched once at the end of the OAuth dance so the
 * settings card can say "Connected to Sandbox Company_US_1" rather than print
 * a realmId at an operator.
 */
export async function fetchCompanyName(target: Target): Promise<string | null> {
  const response = await qboFetch(
    target,
    `/companyinfo/${encodeURIComponent(target.tenantId)}`,
  );
  const info = response.CompanyInfo as Json | undefined;
  const name = info?.CompanyName ?? info?.LegalName;
  return typeof name === "string" && name ? name : null;
}

/**
 * Revokes the refresh token at Intuit.
 *
 * Best effort by design: the local row is marked disconnected either way. A
 * shop that clicked Disconnect must end up disconnected even if Intuit is
 * having an afternoon — the alternative is a button that sometimes does
 * nothing and says so in a way nobody can act on.
 */
export async function revokeQuickBooks(refreshToken: string): Promise<void> {
  const clientId = qboClientId();
  const clientSecret = qboClientSecret();
  if (!clientId || !clientSecret) return;

  await fetch(`${qboRevokeBase()}/v2/oauth2/tokens/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token: refreshToken }),
    cache: "no-store",
  });
}

// ---------------------------------------------------------------------------
// Account + fallback item resolution
// ---------------------------------------------------------------------------

type Ref = { value: string; name: string };

/**
 * The Income account every Item is booked against.
 *
 * QuickBooks refuses to create a Service or NonInventory item without an
 * `IncomeAccountRef`, and the right account is a bookkeeping decision we are
 * not qualified to make — so the company's own first Income account is used,
 * preferring one that calls itself Sales, and the answer is cached on the
 * connection. One lookup per connection instead of one per product.
 */
async function incomeAccountRef(
  connection: LiveConnection,
  settings: ConnectionSettings,
): Promise<Ref> {
  if (settings.qboIncomeAccountRef) return settings.qboIncomeAccountRef;

  const response = await query(
    connection,
    "select Id, Name, AccountType, AccountSubType from Account where AccountType = 'Income' maxresults 20",
  );
  const accounts = (response.Account as Json[] | undefined) ?? [];
  if (accounts.length === 0) {
    throw new Error(
      "This QuickBooks company has no Income account, so products cannot be created. Add one in QuickBooks under Chart of Accounts.",
    );
  }

  const preferred =
    accounts.find((account) =>
      /sales/i.test(String(account.Name ?? account.AccountSubType ?? "")),
    ) ?? accounts[0];

  const ref: Ref = {
    value: String(preferred.Id),
    name: String(preferred.Name ?? "Income"),
  };
  settings.qboIncomeAccountRef = ref;
  await mergeConnectionSettings(connection.shopId, "quickbooks", {
    qboIncomeAccountRef: ref,
  });
  return ref;
}

/**
 * The Item an invoice line falls back to when it sold no catalogue product.
 *
 * `SalesItemLineDetail` requires an `ItemRef`, and plenty of RepairFlow lines
 * are free text ("diagnostic fee", "labour, 45 min"). Rather than refuse those
 * invoices, one generic Service item is found-or-created per company and every
 * such line points at it, with the shop's own wording kept in the line
 * description where a bookkeeper will actually read it.
 */
async function fallbackItemRef(
  connection: LiveConnection,
  settings: ConnectionSettings,
): Promise<Ref> {
  if (settings.qboServiceItemRef) return settings.qboServiceItemRef;

  const name = "RepairFlow Services";
  const existing = await query(
    connection,
    `select Id, Name from Item where Name = '${escapeQuery(name)}' maxresults 1`,
  );
  const found = (existing.Item as Json[] | undefined)?.[0];

  let ref: Ref;
  if (found) {
    ref = { value: String(found.Id), name };
  } else {
    const income = await incomeAccountRef(connection, settings);
    const created = await qboFetch(connection, "/item", {
      method: "POST",
      body: {
        Name: name,
        Type: "Service",
        IncomeAccountRef: { value: income.value },
        Description: "Labour and one-off charges billed from RepairFlow.",
      },
    });
    const item = created.Item as Json | undefined;
    if (!item?.Id) throw new Error("QuickBooks did not return the created item.");
    ref = { value: String(item.Id), name };
  }

  settings.qboServiceItemRef = ref;
  await mergeConnectionSettings(connection.shopId, "quickbooks", {
    qboServiceItemRef: ref,
  });
  return ref;
}

/** Single quotes are the only metacharacter in a QuickBooks query literal. */
function escapeQuery(value: string): string {
  return value.replace(/'/g, "\\'");
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

/**
 * Pushes everything this shop owes QuickBooks, in dependency order.
 *
 * Customers before invoices before payments, because each needs the previous
 * one's remote id. A row whose dependency is not linked yet is counted as
 * skipped rather than failed: it has no link, so the very next pass picks it
 * up again — the link table, not a retry queue, is what makes that safe.
 *
 * Mutates `result`; never throws for a single bad row. Auth and rate-limit
 * failures DO propagate, because both mean "stop, the rest will fail too".
 */
export async function syncQuickBooks(
  connection: LiveConnection,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const settings: ConnectionSettings = { ...connection.settings };

  await syncCustomers(connection, result, watermark);
  await syncProducts(connection, settings, result, watermark);
  await syncInvoices(connection, settings, result, watermark);
  await syncPayments(connection, result);
}

// --- Customers -------------------------------------------------------------

async function syncCustomers(
  connection: LiveConnection,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const links = await loadLinks(connection.shopId, "quickbooks", "customer");
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
        await updateCustomer(connection, row, link);
        bucket.updated += 1;
      } else {
        await createCustomer(connection, row);
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

type CustomerRow = Awaited<ReturnType<typeof db.customer.findMany>>[number];

function customerBody(row: CustomerRow, displayName: string): Json {
  const body: Json = {
    DisplayName: displayName,
    GivenName: row.firstName.slice(0, 100),
    FamilyName: row.lastName.slice(0, 100),
  };
  if (row.businessName) body.CompanyName = row.businessName.slice(0, 100);
  if (row.email) body.PrimaryEmailAddr = { Address: row.email };
  if (row.phone || row.mobile) {
    body.PrimaryPhone = { FreeFormNumber: row.phone ?? row.mobile };
  }
  if (row.address1 || row.city || row.postalCode) {
    body.BillAddr = {
      Line1: row.address1 ?? undefined,
      Line2: row.address2 ?? undefined,
      City: row.city ?? undefined,
      CountrySubDivisionCode: row.state ?? undefined,
      PostalCode: row.postalCode ?? undefined,
      Country: row.country ?? undefined,
    };
  }
  return body;
}

/**
 * DisplayName is unique across a QuickBooks company, and two customers called
 * "John Smith" is an ordinary Tuesday in a repair shop. The first attempt uses
 * the person's real name; a 6240 duplicate is retried with a " (RF-2)",
 * " (RF-3)" … suffix until QuickBooks accepts one. The accepted name is kept
 * in the link so later updates address the same record.
 */
async function createCustomer(
  connection: LiveConnection,
  row: CustomerRow,
): Promise<void> {
  const base = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
    row.businessName ||
    row.email ||
    "Customer";

  for (let attempt = 1; attempt <= 6; attempt++) {
    const displayName = attempt === 1 ? base : `${base} (RF-${attempt})`;
    try {
      const response = await qboFetch(connection, "/customer", {
        method: "POST",
        body: customerBody(row, displayName),
      });
      const created = response.Customer as Json | undefined;
      if (!created?.Id) {
        throw new Error("QuickBooks did not return the created customer.");
      }
      await saveLink(
        connection.shopId,
        "quickbooks",
        "customer",
        row.id,
        String(created.Id),
        { syncToken: String(created.SyncToken ?? "0"), remoteName: displayName },
      );
      return;
    } catch (error) {
      if (!isDuplicateName(error)) throw error;
    }
  }

  throw new Error(
    `QuickBooks already has customers named "${base}" and five variations of it — rename one in QuickBooks.`,
  );
}

/**
 * Sparse update: only the fields listed are touched, so a bookkeeper's own
 * edits to columns RepairFlow knows nothing about survive the sync. SyncToken
 * is QuickBooks' optimistic concurrency check and must be the current one,
 * which is why the link carries it.
 *
 * A local rename is pushed through to DisplayName — a customer who corrected
 * their surname here should not stay wrong in the books. If that new name is
 * already taken in QuickBooks, the record keeps the name it has rather than
 * failing the row: a stale display name is a cosmetic problem, a customer
 * whose invoices stop syncing is not.
 */
async function updateCustomer(
  connection: LiveConnection,
  row: CustomerRow,
  link: Link,
): Promise<void> {
  const current = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  const displayName = await withNameFallback(
    current,
    link.meta.remoteName,
    async (name) => {
      const response = await qboFetch(connection, "/customer", {
        method: "POST",
        body: {
          ...customerBody(row, name),
          Id: link.remoteId,
          SyncToken: link.meta.syncToken ?? "0",
          sparse: true,
        },
      });
      return response.Customer as Json | undefined;
    },
  );

  await saveLink(
    connection.shopId,
    "quickbooks",
    "customer",
    row.id,
    link.remoteId,
    {
      ...link.meta,
      syncToken: String(
        displayName.result?.SyncToken ?? link.meta.syncToken ?? "0",
      ),
      remoteName: displayName.name,
    },
  );
}

/**
 * Tries the name we want, then the name the provider already accepted.
 *
 * The two callers below both address a record whose name is unique in the
 * provider and may have drifted from ours. Attempting the current name first
 * is what makes a correction propagate; falling back is what stops a name
 * clash from wedging that row's sync forever.
 */
async function withNameFallback(
  preferred: string,
  accepted: string | undefined,
  attempt: (name: string) => Promise<Json | undefined>,
): Promise<{ name: string; result: Json | undefined }> {
  try {
    return { name: preferred, result: await attempt(preferred) };
  } catch (error) {
    if (!isDuplicateName(error) || !accepted || accepted === preferred) throw error;
    return { name: accepted, result: await attempt(accepted) };
  }
}

// --- Products --------------------------------------------------------------

type ProductRow = Awaited<ReturnType<typeof db.product.findMany>>[number];

/**
 * Service vs NonInventory.
 *
 * QuickBooks' third type, Inventory, needs an asset account and an inventory
 * start date — a stock ledger RepairFlow does not hand it — so a physical part
 * is a NonInventory item and labour is a Service. Anything the shop tracks a
 * quantity, a serial or a part number for is physical; everything else is work.
 */
function itemType(row: ProductRow): "Service" | "NonInventory" {
  const physical =
    row.serialized ||
    row.stockQty !== 0 ||
    row.lowStockAt !== null ||
    Boolean(row.sku);
  return physical ? "NonInventory" : "Service";
}

async function syncProducts(
  connection: LiveConnection,
  settings: ConnectionSettings,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const links = await loadLinks(connection.shopId, "quickbooks", "product");
  const rows = await db.product.findMany({
    where: changedOrUnlinked(connection.shopId, links, watermark),
    orderBy: { updatedAt: "asc" },
    take: MAX_ROWS_PER_ENTITY,
  });
  if (rows.length === 0) return;

  const bucket = result.entities.product;
  const income = await incomeAccountRef(connection, settings);

  for (const row of rows) {
    const link = links.get(row.id);
    if (link && row.updatedAt <= link.syncedAt) {
      bucket.skipped += 1;
      continue;
    }

    const body: Json = {
      Name: row.name.slice(0, 100),
      Type: itemType(row),
      IncomeAccountRef: { value: income.value },
      UnitPrice: money(row.priceCents),
      Taxable: row.taxable,
      Active: row.active,
    };
    if (row.sku) body.Sku = row.sku.slice(0, 100);
    if (row.description) body.Description = row.description.slice(0, 4000);

    try {
      if (link) {
        const updated = await withNameFallback(
          String(body.Name),
          link.meta.remoteName,
          async (name) => {
            const response = await qboFetch(connection, "/item", {
              method: "POST",
              body: {
                ...body,
                Name: name,
                Id: link.remoteId,
                SyncToken: link.meta.syncToken ?? "0",
                sparse: true,
              },
            });
            return response.Item as Json | undefined;
          },
        );
        await saveLink(
          connection.shopId,
          "quickbooks",
          "product",
          row.id,
          link.remoteId,
          {
            ...link.meta,
            syncToken: String(
              updated.result?.SyncToken ?? link.meta.syncToken ?? "0",
            ),
            remoteName: updated.name,
          },
        );
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

/** Item Name is unique too — same disambiguation ladder as DisplayName. */
async function createItem(
  connection: LiveConnection,
  row: ProductRow,
  body: Json,
): Promise<void> {
  const base = String(body.Name);

  for (let attempt = 1; attempt <= 6; attempt++) {
    const name = attempt === 1 ? base : `${base} (RF-${attempt})`;
    try {
      const response = await qboFetch(connection, "/item", {
        method: "POST",
        body: { ...body, Name: name },
      });
      const created = response.Item as Json | undefined;
      if (!created?.Id) throw new Error("QuickBooks did not return the created item.");
      await saveLink(
        connection.shopId,
        "quickbooks",
        "product",
        row.id,
        String(created.Id),
        { syncToken: String(created.SyncToken ?? "0"), remoteName: name },
      );
      return;
    } catch (error) {
      if (!isDuplicateName(error)) throw error;
    }
  }

  throw new Error(
    `QuickBooks already has items named "${base}" and five variations of it — rename one in QuickBooks.`,
  );
}

// --- Invoices --------------------------------------------------------------

/** The three states that represent a real document a customer has been given. */
const PUSHABLE = ["SENT", "PARTIAL", "PAID"] as const;

async function syncInvoices(
  connection: LiveConnection,
  settings: ConnectionSettings,
  result: SyncResult,
  watermark: Date | null,
): Promise<void> {
  const [invoiceLinks, customerLinks, productLinks] = await Promise.all([
    loadLinks(connection.shopId, "quickbooks", "invoice"),
    loadLinks(connection.shopId, "quickbooks", "customer"),
    loadLinks(connection.shopId, "quickbooks", "product"),
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
  const fallback = await fallbackItemRef(connection, settings);

  for (const row of rows) {
    const link = invoiceLinks.get(row.id);

    // Voided here after it was pushed — void it there too, once.
    if (row.status === "VOID") {
      if (!link || link.meta.voidedAt) {
        bucket.skipped += 1;
        continue;
      }
      try {
        await voidInvoice(connection, link);
        bucket.updated += 1;
      } catch (error) {
        rethrowFatal(error);
        bucket.failed += 1;
        result.errors.push(`invoice #${row.number} void: ${short(error)}`);
      }
      continue;
    }

    // Already in QuickBooks. Issued documents are not re-pushed: an invoice a
    // customer has is a fact, and rewriting it behind a bookkeeper's back is
    // how reconciliation stops being possible.
    if (link) {
      bucket.skipped += 1;
      continue;
    }

    const customerLink = customerLinks.get(row.customerId);
    if (!customerLink) {
      // The customer failed or has not been reached yet; no link was written,
      // so the next pass finds this invoice again.
      bucket.skipped += 1;
      continue;
    }

    try {
      await createInvoice(connection, row, customerLink, productLinks, fallback);
      bucket.created += 1;
    } catch (error) {
      rethrowFatal(error);
      bucket.failed += 1;
      result.errors.push(`invoice #${row.number}: ${short(error)}`);
    }
  }
}

type InvoiceRow = Awaited<
  ReturnType<
    typeof db.invoice.findMany<{ include: { lines: true } }>
  >
>[number];

async function createInvoice(
  connection: LiveConnection,
  row: InvoiceRow,
  customerLink: Link,
  productLinks: Map<string, Link>,
  fallback: Ref,
): Promise<void> {
  const totals = calcTotals(row.lines, row.taxRateBps);

  const Line = row.lines.map((line) => {
    const itemRef = line.productId
      ? (productLinks.get(line.productId)?.remoteId ?? fallback.value)
      : fallback.value;

    return {
      DetailType: "SalesItemLineDetail",
      Amount: money(line.quantity * line.unitPriceCents),
      Description: line.description.slice(0, 4000),
      SalesItemLineDetail: {
        ItemRef: { value: itemRef },
        Qty: line.quantity,
        UnitPrice: money(line.unitPriceCents),
        // Per line, because a repair invoice routinely mixes a taxable part
        // with untaxed labour and one blanket rate would misstate both.
        TaxCodeRef: { value: line.taxable ? "TAX" : "NON" },
      },
    };
  });

  const body: Json = {
    CustomerRef: { value: customerLink.remoteId },
    DocNumber: String(row.number),
    TxnDate: day(row.createdAt),
    Line,
  };
  if (row.dueDate) body.DueDate = day(row.dueDate);
  if (row.notes) body.CustomerMemo = { value: row.notes.slice(0, 1000) };
  if (totals.taxCents > 0) {
    // The total only — RepairFlow rounds tax once on the taxable subtotal
    // (lib/money.ts), and handing QuickBooks the same single figure is what
    // keeps the two systems penny-identical.
    body.TxnTaxDetail = { TotalTax: money(totals.taxCents) };
  }

  const response = await qboFetch(connection, "/invoice", {
    method: "POST",
    body,
  });
  const created = response.Invoice as Json | undefined;
  if (!created?.Id) throw new Error("QuickBooks did not return the created invoice.");

  await saveLink(
    connection.shopId,
    "quickbooks",
    "invoice",
    row.id,
    String(created.Id),
    { syncToken: String(created.SyncToken ?? "0") },
  );
}

/**
 * `?operation=void` keeps the document number in the ledger and zeroes it,
 * which is what an auditor expects; deleting it would leave a gap in the
 * sequence and a question nobody can answer a year later.
 */
async function voidInvoice(
  connection: LiveConnection,
  link: Link,
): Promise<void> {
  const response = await qboFetch(connection, "/invoice", {
    method: "POST",
    query: { operation: "void" },
    body: { Id: link.remoteId, SyncToken: link.meta.syncToken ?? "0" },
  });
  const voided = response.Invoice as Json | undefined;

  await saveLink(
    connection.shopId,
    "quickbooks",
    "invoice",
    link.entityId,
    link.remoteId,
    {
      ...link.meta,
      syncToken: String(voided?.SyncToken ?? link.meta.syncToken ?? "0"),
      voidedAt: new Date().toISOString(),
    },
  );
}

// --- Payments --------------------------------------------------------------

/**
 * Payments are driven purely by the link table, not by the watermark.
 *
 * A payment can only be pushed once its invoice exists in QuickBooks, and that
 * may happen several passes after the payment was taken (a draft invoice that
 * was later sent, say). Selecting "payments against a linked invoice that have
 * no link of their own" means such a payment is found whenever it becomes
 * pushable, instead of being missed because its day had already gone by.
 */
async function syncPayments(
  connection: LiveConnection,
  result: SyncResult,
): Promise<void> {
  const [paymentLinks, invoiceLinks, customerLinks] = await Promise.all([
    loadLinks(connection.shopId, "quickbooks", "payment"),
    loadLinks(connection.shopId, "quickbooks", "invoice"),
    loadLinks(connection.shopId, "quickbooks", "customer"),
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
    include: { invoice: { select: { customerId: true, number: true } } },
  });

  const bucket = result.entities.payment;

  for (const row of rows) {
    const invoiceLink = invoiceLinks.get(row.invoiceId);
    const customerLink = customerLinks.get(row.invoice.customerId);
    if (!invoiceLink || !customerLink) {
      bucket.skipped += 1;
      continue;
    }

    try {
      const response = await qboFetch(connection, "/payment", {
        method: "POST",
        body: {
          CustomerRef: { value: customerLink.remoteId },
          TotalAmt: money(row.amountCents),
          TxnDate: day(row.createdAt),
          PrivateNote: row.reference
            ? `${row.method} · ${row.reference}`.slice(0, 1000)
            : row.method,
          Line: [
            {
              Amount: money(row.amountCents),
              LinkedTxn: [{ TxnId: invoiceLink.remoteId, TxnType: "Invoice" }],
            },
          ],
        },
      });
      const created = response.Payment as Json | undefined;
      if (!created?.Id) {
        throw new Error("QuickBooks did not return the created payment.");
      }
      await saveLink(
        connection.shopId,
        "quickbooks",
        "payment",
        row.id,
        String(created.Id),
        { syncToken: String(created.SyncToken ?? "0") },
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

/**
 * "Rows this pass should look at": anything never pushed, plus anything edited
 * since the last clean pass. Both halves are needed — the watermark alone
 * would skip a row created while an earlier pass was failing, and the unlinked
 * set alone would never notice an edit.
 *
 * Bounded by the shop's own catalogue size, which is the right order of
 * magnitude for a repair shop; every query below also caps at 200 rows.
 */
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

/** Auth and rate limiting end the whole pass; a bad row does not. */
function rethrowFatal(error: unknown): void {
  if (
    error instanceof IntegrationAuthError ||
    error instanceof IntegrationRateLimitError
  ) {
    throw error;
  }
}

function short(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}
