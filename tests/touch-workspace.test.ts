import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOUCH_WORKSPACES, workspaceActions, workspaceBack } from "@/lib/touch-workspace";

const jar = vi.hoisted(() => ({ raw: undefined as string | undefined, set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => jar.raw ? { value: jar.raw } : undefined, set: jar.set }) }));
import { readUiPrefs, writeUiPrefs } from "@/lib/prefs";

describe("touch workspace navigation", () => {
  it("returns deep links to their workspace instead of leaving users at a dead end", () => {
    expect(workspaceBack("/tickets/job123")).toBe("/tickets");
    expect(workspaceBack("/tickets")).toBe("/counter");
    expect(workspaceBack("/counter/repairs")).toBe("/counter");
    // Edit goes back to the product it edits (it used to skip to the Stock list).
    expect(workspaceBack("/inventory/part123/edit")).toBe("/inventory/part123");
    expect(workspaceBack("/settings/assistant")).toBe("/settings");
  });
  it("keeps restricted supplier, import and drawer actions out of staff workspaces", () => {
    expect(workspaceActions(TOUCH_WORKSPACES.products, "TECH").map(action => action.href)).not.toContain("/inventory/import");
    expect(workspaceActions(TOUCH_WORKSPACES.sales, "STAFF").map(action => action.href)).not.toContain("/pos/drawers");
    expect(workspaceActions(TOUCH_WORKSPACES.customers, "TECH").map(action => action.href)).not.toContain("/customers/import");
    expect(workspaceActions(TOUCH_WORKSPACES.products, "OWNER").length).toBe(5);
  });
});

describe("task home preference", () => {
  beforeEach(() => { jar.raw = undefined; jar.set.mockReset(); });
  it("opens new devices and former default cookies in Easy mode", async () => {
    expect((await readUiPrefs()).simple).toBe(true);
    jar.raw = JSON.stringify({ simple: false, density: "compact" });
    expect(await readUiPrefs()).toMatchObject({ simple: true, density: "compact" });
    jar.raw = "broken cookie";
    expect((await readUiPrefs()).simple).toBe(true);
  });
  it("remembers an explicit Full view choice in the updated app", async () => {
    await writeUiPrefs({ simple: false });
    jar.raw = jar.set.mock.calls[0][1];
    expect((await readUiPrefs()).simple).toBe(false);
  });
});
