import { rm } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import { removeUpload } from "@/lib/storage";
import { isSafeShopId } from "./config";
import { sendShopDeletedEmail } from "./email";

/**
 * The purge: hard-deletes a shop whose grace period is over.
 *
 * Job name: "shop deletions" (JobsSummary.deletions), run by lib/jobs on the
 * 15-minute in-process timer and on /api/cron.
 *
 * SAFETY, in order of how much it matters:
 *
 *   1. The shopId is checked to be a real id BEFORE any query. Prisma drops a
 *      key whose value is undefined, so `deleteMany({ where: { shopId } })`
 *      with an undefined shopId deletes EVERY tenant's rows. lib/db-guard.ts
 *      only catches `id: undefined`; this function refuses the shopId case
 *      itself, and tests/account-deletion-purge.test.ts proves every delete
 *      carries the id.
 *   2. Every delete is scoped by that one shopId (directly, or through a
 *      parent that carries it for the child tables without one).
 *   3. Re-checked inside the transaction: the shop must still be pending and
 *      past its date, so a cancel that landed a moment ago wins.
 *   4. One transaction: a failure leaves the shop whole (and still suspended),
 *      and the next run tries again. Re-running after success finds no shop
 *      and does nothing — idempotent.
 *
 * FILES go first, while the rows that name them still exist: if the database
 * step then fails, the next run deletes the (already missing) objects again,
 * which every driver treats as a no-op. The other way round would leave
 * orphaned objects nobody could find.
 *
 * The ORDER below is children before parents. Almost every relation cascades
 * from Shop anyway, but PurchaseOrder -> Vendor is RESTRICT, and explicit,
 * scoped statements keep each step small and make the scope testable. The
 * final shop delete cascades anything a future table adds before this list
 * learns about it.
 *
 * LOGGING. The shop's AuditLog goes with it, so the platform-level record is
 * the server log line `[account-deletion] purged shop <id>` with row counts.
 */

export type PurgeSummary = { purged: number; failed: number; errors: string[] };

/** Due shops, oldest first. A handful per run keeps one pass bounded. */
const MAX_PER_RUN = 5;

export async function runDueShopDeletions(now: Date = new Date()): Promise<PurgeSummary> {
  const summary: PurgeSummary = { purged: 0, failed: 0, errors: [] };
  const due = await db.shop.findMany({
    where: { deletionRequestedAt: { not: null }, deletionPurgeAfter: { lte: now } },
    select: { id: true },
    orderBy: { deletionPurgeAfter: "asc" },
    take: MAX_PER_RUN,
  });

  for (const shop of due) {
    try {
      if (await purgeShop(shop.id, now)) summary.purged += 1;
    } catch (error) {
      summary.failed += 1;
      const text = error instanceof Error ? error.message : String(error);
      summary.errors.push(`shop ${shop.id}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
      console.error(`[account-deletion] purge of shop ${shop.id} failed:`, error);
    }
  }
  return summary;
}

/**
 * Deletes one shop and everything in it. Returns false when the shop is not
 * (or no longer) due — gone already, cancelled, or not yet past its date.
 */
export async function purgeShop(shopId: string, now: Date = new Date()): Promise<boolean> {
  if (!isSafeShopId(shopId)) {
    throw new Error("purgeShop refused: the shop id is missing or malformed.");
  }

  const shop = await db.shop.findFirst({
    where: { id: shopId, deletionRequestedAt: { not: null }, deletionPurgeAfter: { lte: now } },
    select: { id: true, name: true, email: true, logoPath: true, logoStorage: true, deletionRequestedById: true },
  });
  if (!shop) return false;

  // Who to tell, read before their row goes.
  const requester = shop.deletionRequestedById
    ? await db.user.findFirst({
        where: { id: shop.deletionRequestedById, shopId },
        select: { name: true, email: true },
      })
    : null;

  await removeShopFiles(shopId, shop.logoPath, shop.logoStorage);

  const counts = await db.$transaction(
    async (tx) => {
      // 3. Still pending and still due, now that we hold a transaction.
      const still = await tx.shop.findFirst({
        where: { id: shopId, deletionRequestedAt: { not: null }, deletionPurgeAfter: { lte: now } },
        select: { id: true },
      });
      if (!still) return null;

      const c: Record<string, number> = {};
      const run = async (name: string, op: Promise<{ count: number }>) => {
        c[name] = (await op).count;
      };
      const byShop = { shopId };

      // Scanner, webhooks, campaigns, personal UI state.
      await run("scanEvent", tx.scanEvent.deleteMany({ where: byShop }));
      await run("scanSession", tx.scanSession.deleteMany({ where: byShop }));
      await run("webhookDelivery", tx.webhookDelivery.deleteMany({ where: byShop }));
      await run("webhook", tx.webhook.deleteMany({ where: byShop }));
      await run("campaignSend", tx.campaignSend.deleteMany({ where: byShop }));
      await run("campaign", tx.campaign.deleteMany({ where: byShop }));
      await run("pushSubscription", tx.pushSubscription.deleteMany({ where: byShop }));
      await run("nativePushDevice", tx.nativePushDevice.deleteMany({ where: byShop }));
      await run("savedView", tx.savedView.deleteMany({ where: byShop }));

      // Money and stock movements.
      await run("refund", tx.refund.deleteMany({ where: byShop }));
      await run("deposit", tx.deposit.deleteMany({ where: byShop }));
      await run("payment", tx.payment.deleteMany({ where: byShop }));
      await run("productSerial", tx.productSerial.deleteMany({ where: byShop }));
      await run("timeEntry", tx.timeEntry.deleteMany({ where: byShop }));
      await run("ticketCharge", tx.ticketCharge.deleteMany({ where: byShop }));
      await run("partOrder", tx.partOrder.deleteMany({ where: byShop }));
      await run("stockAdjustment", tx.stockAdjustment.deleteMany({ where: byShop }));
      await run("creditAdjustment", tx.creditAdjustment.deleteMany({ where: byShop }));

      // Messages, files, leads, bookings.
      await run("communicationLog", tx.communicationLog.deleteMany({ where: byShop }));
      await run("attachment", tx.attachment.deleteMany({ where: byShop }));
      await run("automaticProductPhoto", tx.automaticProductPhoto.deleteMany({ where: byShop }));
      await run("lead", tx.lead.deleteMany({ where: byShop }));
      await run("appointment", tx.appointment.deleteMany({ where: byShop }));

      // Documents and their lines (lines have no shopId: scoped through the parent).
      await run("invoiceLine", tx.invoiceLine.deleteMany({ where: { invoice: byShop } }));
      await run("invoice", tx.invoice.deleteMany({ where: byShop }));
      await run("estimateLine", tx.estimateLine.deleteMany({ where: { estimate: byShop } }));
      await run("estimate", tx.estimate.deleteMany({ where: byShop }));
      await run("recurringInvoiceLine", tx.recurringInvoiceLine.deleteMany({ where: { recurringInvoice: byShop } }));
      await run("recurringInvoice", tx.recurringInvoice.deleteMany({ where: byShop }));
      await run("purchaseOrderLine", tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: byShop } }));
      await run("purchaseOrder", tx.purchaseOrder.deleteMany({ where: byShop }));

      // Repairs, then the people and devices they were for.
      await run("ticketComment", tx.ticketComment.deleteMany({ where: byShop }));
      await run("ticket", tx.ticket.deleteMany({ where: byShop }));
      await run("contact", tx.contact.deleteMany({ where: { customer: byShop } }));
      await run("portalToken", tx.portalToken.deleteMany({ where: { customer: byShop } }));
      await run("asset", tx.asset.deleteMany({ where: byShop }));
      await run("customer", tx.customer.deleteMany({ where: byShop }));

      // Catalogue and configuration.
      await run("product", tx.product.deleteMany({ where: byShop }));
      await run("vendor", tx.vendor.deleteMany({ where: byShop }));
      await run("taxRate", tx.taxRate.deleteMany({ where: byShop }));
      await run("checklistTemplate", tx.checklistTemplate.deleteMany({ where: byShop }));
      await run("cannedResponse", tx.cannedResponse.deleteMany({ where: byShop }));
      await run("integrationLink", tx.integrationLink.deleteMany({ where: byShop }));
      await run("integrationConnection", tx.integrationConnection.deleteMany({ where: byShop }));
      await run("apiKey", tx.apiKey.deleteMany({ where: byShop }));

      // Staff.
      await run("timeClockEntry", tx.timeClockEntry.deleteMany({ where: byShop }));
      await run("cashDrawerSession", tx.cashDrawerSession.deleteMany({ where: byShop }));
      await run("auditLog", tx.auditLog.deleteMany({ where: byShop }));
      await run("passwordResetToken", tx.passwordResetToken.deleteMany({ where: { user: byShop } }));
      await run("emailAuthCode", tx.emailAuthCode.deleteMany({ where: { user: byShop } }));
      await run("user", tx.user.deleteMany({ where: byShop }));
      await run("location", tx.location.deleteMany({ where: byShop }));

      // Platform tables that carry the shop id without a foreign key.
      await run("usageCounter", tx.usageCounter.deleteMany({ where: byShop }));
      await run("productFeedback", tx.productFeedback.deleteMany({ where: { reporterShopId: shopId } }));

      // Last: the tenant root. Cascades anything a newer table added.
      await run("shop", tx.shop.deleteMany({ where: { id: shopId } }));
      return c;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  if (!counts) return false;

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.info(
    `[account-deletion] purged shop ${shopId} at ${now.toISOString()}: ${total} rows`,
    JSON.stringify(counts),
  );

  const to = requester?.email ?? shop.email;
  if (to) await sendShopDeletedEmail({ to, name: requester?.name ?? "there", shopName: shop.name });
  return true;
}

/**
 * Removes every stored object of the shop through the driver that wrote it,
 * then, for the local driver, the shop's whole `public/uploads/<shopId>/`
 * folder (which also catches files no row points at any more).
 */
async function removeShopFiles(shopId: string, logoPath: string | null, logoStorage: string | null): Promise<void> {
  const [attachments, photos] = await Promise.all([
    db.attachment.findMany({ where: { shopId }, select: { storage: true, path: true } }),
    db.automaticProductPhoto.findMany({
      where: { shopId, path: { not: null } },
      select: { storage: true, path: true },
    }),
  ]);

  const objects = [
    ...attachments,
    ...photos.map((p) => ({ storage: p.storage ?? "local", path: p.path as string })),
    ...(logoPath ? [{ storage: logoStorage ?? "local", path: logoPath }] : []),
  ];
  for (const object of objects) {
    await removeUpload(object.storage, object.path); // never throws
  }

  if (!isSafeShopId(shopId)) return;
  const folder = path.join(process.cwd(), "public", "uploads", shopId);
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    console.error(`[account-deletion] could not remove ${folder}:`, error);
  }
}
