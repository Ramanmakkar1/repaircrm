import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOUCH_WORKSPACES, workspaceBack } from "@/lib/touch-workspace";

const jar = vi.hoisted(() => ({ raw: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (jar.raw ? { value: jar.raw } : undefined), set: vi.fn() }) }));
import { homePath } from "@/lib/prefs";

describe("where signing in lands", () => {
  beforeEach(() => { jar.raw = undefined; });

  it("sends a new device to the box home, not the old dashboard", async () => {
    expect(await homePath()).toBe("/counter");
  });

  it("keeps Counter as home after an explicit Full view choice", async () => {
    jar.raw = JSON.stringify({ simple: false, taskHomeVersion: 1 });
    expect(await homePath()).toBe("/counter");
  });

  it("treats an older cookie (from before the task home) as Easy mode", async () => {
    jar.raw = JSON.stringify({ simple: false });
    expect(await homePath()).toBe("/counter");
  });

  it("falls back to the box home when the cookie is unreadable", async () => {
    jar.raw = "{not json";
    expect(await homePath()).toBe("/counter");
  });
});

describe("Back from pages Home does not group", () => {
  it("returns a detail page to its own list instead of Home", () => {
    expect(workspaceBack("/estimates/abc123")).toBe("/estimates");
    expect(workspaceBack("/leads/abc123")).toBe("/leads");
    expect(workspaceBack("/marketing/campaigns/9")).toBe("/marketing");
  });

  it("still goes Home from a top-level page and from the dashboard", () => {
    expect(workspaceBack("/reports")).toBe("/counter");
    expect(workspaceBack("/time-clock")).toBe("/counter");
    expect(workspaceBack("/dashboard")).toBe("/counter");
  });

  it("keeps workspace pages returning to their workspace", () => {
    expect(workspaceBack("/invoices/inv1")).toBe("/invoices");
    expect(workspaceBack("/pos/drawers")).toBe("/pos");
  });
});

describe("unpaid shortcuts", () => {
  it("counts sent and part-paid invoices together, matching what Home counts", () => {
    const unpaid = TOUCH_WORKSPACES.invoices.actions.find((action) => action.label === "Unpaid invoices");
    expect(unpaid?.href).toBe("/invoices?status=unpaid");
  });
});
