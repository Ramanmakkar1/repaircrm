import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * Settings → Devices & repair steps saves on every Earlier / Later / Hide tap.
 * It used to write one activity-history row per tap ("Devices and problems
 * saved" eighty times in one sitting). A tap that only rearranges now joins the
 * rearranging entry the same person started in the last few minutes; anything
 * that changes what is in the lists always gets its own entry.
 */

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const session = vi.hoisted(() => ({ shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Dana" }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
  hashPassword: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/audit", () => ({ audit }));

const { saveIntakeOptionsAction } = await import("@/app/(app)/settings/actions");
const { DEFAULT_DEVICE_KINDS, AUDIT_BURST_MINUTES, moveDeviceKind, setDeviceHidden } = await import("@/lib/intake-options");

const standard = () => DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind }));

function shopHas(settings: Record<string, unknown>) {
  handlers["shop.findUnique"] = () => ({ settings });
  handlers["shop.update"] = () => ({});
}

beforeEach(() => {
  resetDb();
  audit.mockClear();
  revalidatePath.mockClear();
  shopHas({ deviceKinds: standard(), problemTypes: ["Screen Repair", "Battery Replacement", "Other"] });
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("rearranging the check-in boxes: one activity entry per burst", () => {
  it("writes an entry for the first move, saying what moved, marked as a rearrangement", async () => {
    handlers["auditLog.findFirst"] = () => null;
    const result = await saveIntakeOptionsAction({ deviceKinds: moveDeviceKind(standard(), "tablet", -1) });
    expect(result.ok).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Check-in boxes rearranged: Device order changed",
        meta: expect.objectContaining({ section: "devices-and-problems", kind: "arrange", burstMinutes: AUDIT_BURST_MINUTES }),
      }),
    );
  });

  it("does not write another while the same person keeps rearranging, but still saves every tap", async () => {
    handlers["auditLog.findFirst"] = () => ({ createdAt: minutesAgo(2), meta: { section: "devices-and-problems", kind: "arrange" } });
    for (const kinds of [moveDeviceKind(standard(), "tablet", -1), setDeviceHidden(standard(), "drone", true)]) {
      const result = await saveIntakeOptionsAction({ deviceKinds: kinds });
      expect(result.ok).toBe(true);
    }
    expect(audit).not.toHaveBeenCalled();
    expect(callsTo("shop.update")).toHaveLength(2);
  });

  it("looks only at the signed-in person's own recent entries in their own shop", async () => {
    handlers["auditLog.findFirst"] = () => null;
    await saveIntakeOptionsAction({ deviceKinds: setDeviceHidden(standard(), "drone", true), shopId: "shop_2" } as never);
    const where = whereOf("auditLog.findFirst");
    expect(where).toMatchObject({ shopId: "shop_1", userId: "user_1", action: "settings.updated", entity: "settings" });
    const since = (where.createdAt as { gte: Date }).gte.getTime();
    expect(Date.now() - since).toBeGreaterThanOrEqual(AUDIT_BURST_MINUTES * 60_000 - 1000);
    expect(Date.now() - since).toBeLessThanOrEqual(AUDIT_BURST_MINUTES * 60_000 + 1000);
  });

  it("starts a new entry after a pause, or after a different kind of change", async () => {
    handlers["auditLog.findFirst"] = () => ({ createdAt: minutesAgo(2), meta: { section: "devices-and-problems", kind: "change" } });
    await saveIntakeOptionsAction({ deviceKinds: setDeviceHidden(standard(), "drone", true) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ summary: "Check-in boxes rearranged: Drone hidden" }));
  });

  it("always writes its own entry for a change to what is in the lists", async () => {
    handlers["auditLog.findFirst"] = () => ({ createdAt: minutesAgo(1), meta: { section: "devices-and-problems", kind: "arrange" } });
    const renamed = standard().map((kind) => (kind.id === "tablet" ? { ...kind, label: "iPad" } : kind));
    await saveIntakeOptionsAction({ deviceKinds: renamed });
    await saveIntakeOptionsAction({ addDevice: { label: "Hoverboard" } });
    await saveIntakeOptionsAction({ reset: ["devices"] });
    expect(audit).toHaveBeenCalledTimes(3);
    expect(audit.mock.calls.map((call) => (call as unknown as [{ summary: string }])[0].summary)).toEqual([
      "Devices and problems saved",
      "Device “Hoverboard” added to the check-in",
      "Devices and problems put back to the standard list",
    ]);
    // A content change never even asks about the last entry.
    expect(callsTo("auditLog.findFirst")).toHaveLength(0);
  });

  it("writes the entry anyway when the history cannot be read (a spare row beats a missing one)", async () => {
    handlers["auditLog.findFirst"] = () => {
      throw new Error("database had a bad afternoon");
    };
    const result = await saveIntakeOptionsAction({ deviceKinds: moveDeviceKind(standard(), "tablet", -1) });
    expect(result.ok).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("never asks anyone but an owner", async () => {
    session.role = "TECH";
    const result = await saveIntakeOptionsAction({ deviceKinds: moveDeviceKind(standard(), "tablet", -1) });
    session.role = "OWNER";
    expect(result).toEqual({ ok: false, error: "Only an owner can change this." });
    expect(callsTo("auditLog.findFirst")).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });
});
