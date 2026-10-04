import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "AI match columns" in the product importer.
 *
 * The button used to be there whether or not an AI provider was switched on, so
 * pressing it spent a unit of the shop's daily allowance and answered with a
 * message about AI_DRIVER. Now the page only passes `onSuggest` to the wizard
 * (which only then draws the button) when AI is on, and the action itself
 * refuses a stale or hand-made call before touching the allowance.
 */

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/components/import/commit", () => ({ commitImport: vi.fn(), previewImport: vi.fn() }));

const batch = vi.hoisted(() => ({
  id: "a".repeat(32),
  shopId: "shop_1",
  kind: "products" as const,
  fileName: "stock.csv",
  createdAt: 0,
  headers: ["Item", "SKU"],
  rows: [["Screen", "S-1"]],
}));
vi.mock("@/lib/import-store", () => ({
  readImportBatch: vi.fn(async () => batch),
  deleteImportBatch: vi.fn(),
}));
const { generateMock, quotaMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  quotaMock: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/ai", () => ({ generate: generateMock }));
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: quotaMock }));

const { clearRateLimit } = await import("@/lib/rate-limit");
const { suggestProductMappingAction } = await import("@/app/(app)/inventory/import/actions");
const { default: ImportProductsPage } = await import("@/app/(app)/inventory/import/page");
const { default: ImportCustomersPage } = await import("@/app/(app)/customers/import/page");
const { ImportWizard } = await import("@/components/import/import-wizard");

function aiOff() {
  vi.stubEnv("AI_DRIVER", "off");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
}
function aiOn() {
  vi.stubEnv("AI_DRIVER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "sk_test");
}

/** Finds the first element of `type` anywhere in a rendered (not yet mounted) tree. */
function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  clearRateLimit("import-ai:shop_1:user_1");
  generateMock.mockReset();
  quotaMock.mockClear();
});

describe("the import pages", () => {
  it("do not offer AI matching when AI is off", async () => {
    aiOff();
    const wizard = findElement(await ImportProductsPage(), ImportWizard);
    expect(wizard).not.toBeNull();
    expect(wizard!.props.onSuggest).toBeUndefined();
  });

  it("offer AI matching when an AI provider is switched on", async () => {
    aiOn();
    const wizard = findElement(await ImportProductsPage(), ImportWizard);
    expect(wizard!.props.onSuggest).toBe(suggestProductMappingAction);
  });

  it("never offer it on the customer importer, which has no AI step", async () => {
    aiOn();
    const wizard = findElement(await ImportCustomersPage(), ImportWizard);
    expect(wizard).not.toBeNull();
    expect(wizard!.props.onSuggest).toBeUndefined();
  });
});

describe("suggestProductMappingAction", () => {
  it("says so in plain words, without spending the allowance or calling a provider, when AI is off", async () => {
    aiOff();
    const result = await suggestProductMappingAction(batch.id);

    expect(result).toEqual({
      ok: false,
      error: "AI matching isn't switched on for this shop. Match the columns by hand.",
    });
    expect(quotaMock).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("matches columns when AI is on", async () => {
    aiOn();
    generateMock.mockResolvedValue({ ok: true, text: '{"mapping":{"name":0,"sku":1},"notes":[]}' });

    const result = await suggestProductMappingAction(batch.id);

    expect(result).toMatchObject({ ok: true, mapping: { name: 0, sku: 1 } });
    expect(quotaMock).toHaveBeenCalledWith("shop_1", "text");
  });

  it("keeps the provider's technical wording out of the message when the call fails", async () => {
    aiOn();
    generateMock.mockResolvedValue({ ok: false, reason: 'openai returned 401 {"error":{"message":"Incorrect API key"}}' });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await suggestProductMappingAction(batch.id);

    expect(result).toEqual({
      ok: false,
      error: "AI matching isn't working right now. Match the columns by hand.",
    });
  });
});
