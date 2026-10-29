import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_1", shopId: "shop_1", role: "OWNER" })),
}));

// Every job is stubbed to record which shop it ran for.
const ranFor: string[] = [];
const zero = (shopId: string) => { ranFor.push(shopId); return { errors: [] }; };
vi.mock("@/lib/jobs/push", () => ({ runStaffPushForShop: async (id: string) => { ranFor.push(id); } }));
vi.mock("@/lib/jobs/recurring", () => ({ runDueRecurringInvoicesForShop: async (id: string) => ({ ...zero(id), created: 0, charges: { attempted: 0, succeeded: 0, failed: 0 } }) }));
vi.mock("@/app/(app)/marketing/engine", () => ({
  syncCampaignSends: async () => ({ scheduled: 0 }),
  runDueCampaignSends: async () => ({ sent: 0, failed: 0, firstProblem: "Other Shop: bounced alice@example.com" }),
}));
vi.mock("@/lib/jobs/integrations", () => ({ runIntegrationSyncForShop: async () => ({ pushed: 0, failed: 0, errors: [] }) }));
vi.mock("@/lib/jobs/sla", () => ({ runSlaChecksForShop: async () => ({ breached: 0, notified: 0, errors: [] }) }));
vi.mock("@/lib/jobs/webhooks", () => ({ runDueWebhookDeliveries: async () => ({ delivered: 0, failed: 0 }) }));
vi.mock("@/lib/jobs/appointments", () => ({ runDueAppointmentRemindersForShop: async () => ({ sent: 0, errors: [] }) }));
vi.mock("@/lib/jobs/reviews", () => ({ runDueReviewRequestsForShop: async () => ({ sent: 0, errors: [] }) }));
vi.mock("@/lib/jobs/housekeeping", () => ({ purgeExpiredPortalTokens: async () => 0, purgeExpiredScanSessions: async () => 0 }));
vi.mock("@/lib/account-deletion/purge", () => ({ runDueShopDeletions: vi.fn(async () => ({ purged: 0, failed: 0, errors: [] })) }));

const { runJobsNowAction } = await import("@/app/(app)/settings/automation-actions");
const { runDueShopDeletions } = await import("@/lib/account-deletion/purge");

/**
 * Settings → Reminders & follow-ups → Run now used to run every tenant's jobs
 * and show the owner the whole platform's summary, other shops' names and
 * error text included. It now runs and reports the owner's own shop alone.
 */
beforeEach(() => {
  resetDb();
  ranFor.length = 0;
  handlers["shop.findFirst"] = (args) => {
    const where = args.where as { id?: string };
    return where.id === "shop_1" ? { id: "shop_1", settings: {} } : null;
  };
  handlers["shop.findMany"] = () => [{ id: "shop_1" }, { id: "shop_2" }];
  handlers["shop.findUnique"] = () => ({ settings: {} });
  handlers["shop.update"] = (args) => args.data;
});

describe("runJobsNowAction", () => {
  it("runs only the session's shop and records only its own slice", async () => {
    const result = await runJobsNowAction();
    if (!result.ok) throw new Error(result.error);

    expect(new Set(ranFor)).toEqual(new Set(["shop_1"]));
    expect(callsTo("shop.findMany")).toEqual([]);
    expect(runDueShopDeletions).not.toHaveBeenCalled();
    expect(result.summary.shops).toBe(1);
    for (const call of callsTo("shop.update")) {
      expect((call.args.where as { id: string }).id).toBe("shop_1");
    }
  });
});
