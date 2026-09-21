import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * identifyProductAction (app/(app)/inventory/vision-actions.ts).
 *
 * The guarded doorway to the vision model: validate the upload, then parse the
 * model's JSON into Quick Add fields. The vision driver is stubbed.
 */

const { describeImageMock } = vi.hoisted(() => ({ describeImageMock: vi.fn() }));

vi.mock("@/lib/ai/vision", () => ({ describeImage: describeImageMock }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ shopId: "s1", userId: "u1", role: "OWNER", name: "A" })),
}));

const { identifyProductAction } = await import("@/app/(app)/inventory/vision-actions");

function form(image?: Blob): FormData {
  const fd = new FormData();
  if (image) fd.set("image", image, "product.jpg");
  return fd;
}

beforeEach(() => {
  describeImageMock.mockReset();
});

describe("identifyProductAction", () => {
  it("rejects a missing image without a model call", async () => {
    expect(await identifyProductAction(form())).toMatchObject({ ok: false });
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("rejects an empty image", async () => {
    const result = await identifyProductAction(form(new Blob([], { type: "image/jpeg" })));
    expect(result).toMatchObject({ ok: false });
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized image", async () => {
    const big = new Blob([new Uint8Array(7 * 1024 * 1024)], { type: "image/jpeg" });
    expect(await identifyProductAction(form(big))).toMatchObject({ ok: false });
    expect(describeImageMock).not.toHaveBeenCalled();
  });

  it("parses the model's JSON into fields", async () => {
    describeImageMock.mockResolvedValue({
      ok: true,
      text: 'Sure: {"name":"iPhone 6 Screen","category":"Screens"}',
    });
    const result = await identifyProductAction(
      form(new Blob(["abc"], { type: "image/jpeg" })),
    );
    expect(result).toEqual({
      ok: true,
      fields: { name: "iPhone 6 Screen", category: "Screens" },
    });
  });

  it("fails gracefully on an unrecognisable reply", async () => {
    describeImageMock.mockResolvedValue({ ok: true, text: "no idea, sorry" });
    const result = await identifyProductAction(
      form(new Blob(["abc"], { type: "image/jpeg" })),
    );
    expect(result).toMatchObject({ ok: false });
  });
});
