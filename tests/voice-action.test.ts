import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * transcribeAudioAction (app/(app)/voice/actions.ts).
 *
 * The action is the guarded doorway to the transcription key: it validates the
 * upload (present, non-empty, not oversized) and only then spends a call. The
 * transcription driver itself is stubbed — this is about the guard.
 */

const { transcribeMock } = vi.hoisted(() => ({ transcribeMock: vi.fn() }));

vi.mock("@/lib/ai/transcribe", () => ({ transcribe: transcribeMock }));
// The daily AI allowance is counted in Postgres; these tests are about the
// upload guard, so the allowance is stubbed — never the real database.
const { quotaMock } = vi.hoisted(() => ({ quotaMock: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: quotaMock }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ shopId: "s1", userId: "u1", role: "OWNER", name: "A" })),
}));

const { transcribeAudioAction } = await import("@/app/(app)/voice/actions");

function form(audio?: Blob): FormData {
  const fd = new FormData();
  if (audio) fd.set("audio", audio, "command.webm");
  return fd;
}

beforeEach(() => {
  transcribeMock.mockReset();
});

describe("transcribeAudioAction", () => {
  it("rejects a request with no audio, without spending a call", async () => {
    expect(await transcribeAudioAction(form())).toMatchObject({ ok: false });
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("rejects an empty recording", async () => {
    const result = await transcribeAudioAction(form(new Blob([], { type: "audio/webm" })));
    expect(result).toMatchObject({ ok: false });
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized recording", async () => {
    const big = new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "audio/webm" });
    const result = await transcribeAudioAction(form(big));
    expect(result).toMatchObject({ ok: false });
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("delegates a valid recording to the transcription driver", async () => {
    transcribeMock.mockResolvedValue({ ok: true, text: "add ten iphone screens" });
    const result = await transcribeAudioAction(
      form(new Blob(["abc"], { type: "audio/webm" })),
    );
    expect(result).toEqual({ ok: true, text: "add ten iphone screens" });
    expect(transcribeMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the daily allowance without spending a call", async () => {
    quotaMock.mockResolvedValueOnce({ ok: false, reason: "used up" } as never);
    const result = await transcribeAudioAction(form(new Blob(["abc"], { type: "audio/webm" })));
    expect(result).toEqual({ ok: false, reason: "used up" });
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});
