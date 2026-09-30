import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, locked: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/session", () => ({ authSecretKey: () => new TextEncoder().encode("a-test-only-secret-at-least-32-characters") }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/comms/drivers", () => ({ deliverEmail: mock.send }));
vi.mock("@/lib/db", () => ({ db: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
  $queryRaw: mock.locked,
  emailAuthCode: {
    findUnique: async () => mock.row,
    update: async ({ data }: { data: { attempts: { increment: number }; usedAt?: Date } }) => { if (mock.row) { mock.row.attempts = Number(mock.row.attempts) + data.attempts.increment; if (data.usedAt) mock.row.usedAt = data.usedAt; } },
  },
}) } }));
import { hashEmailCode, matchesEmailCode, verifyEmailCode } from "@/lib/email-code";
const challenge = "a".repeat(48);
beforeEach(() => {
  mock.locked.mockClear();
  mock.row = { id: "code", challenge, purpose: "login", email: "owner@example.com", attempts: 0, usedAt: null, expiresAt: new Date(Date.now() + 60_000), lastSentAt: new Date(), codeHash: hashEmailCode(challenge, "login", "123456"), user: { id: "user", email: "owner@example.com", active: true, passwordChangedAt: null } };
});
describe("email authentication codes", () => {
  it("binds codes to both challenge and purpose", () => {
    const hash = hashEmailCode(challenge, "login", "123456");
    expect(matchesEmailCode(hash, challenge, "login", "123456")).toBe(true);
    expect(matchesEmailCode(hash, challenge, "reset", "123456")).toBe(false);
    expect(matchesEmailCode(hash, "b".repeat(48), "login", "123456")).toBe(false);
    expect(matchesEmailCode(hash, challenge, "login", "12345")).toBe(false);
  });
  it("locks, consumes, and refuses replay of a correct code", async () => {
    expect(await verifyEmailCode(challenge, "123456", "login")).toMatchObject({ id: "user" });
    expect(mock.locked).toHaveBeenCalled();
    expect(mock.row?.usedAt).toBeInstanceOf(Date);
    expect(await verifyEmailCode(challenge, "123456", "login")).toBeNull();
  });
  it("locks out after five incorrect guesses, even if the next guess is correct", async () => {
    for (let i = 0; i < 5; i++) expect(await verifyEmailCode(challenge, "654321", "login")).toBeNull();
    expect(mock.row?.attempts).toBe(5);
    expect(await verifyEmailCode(challenge, "123456", "login")).toBeNull();
  });
  it.each(["expired", "disabled", "changed-email", "changed-password", "wrong-purpose"])("refuses %s challenges", async kind => {
    if (!mock.row) throw new Error("No test row");
    const user = mock.row.user as Record<string, unknown>;
    if (kind === "expired") mock.row.expiresAt = new Date(0);
    if (kind === "disabled") user.active = false;
    if (kind === "changed-email") user.email = "new@example.com";
    if (kind === "changed-password") user.passwordChangedAt = new Date(Date.now() + 1000);
    if (kind === "wrong-purpose") mock.row.purpose = "reset";
    expect(await verifyEmailCode(challenge, "123456", "login")).toBeNull();
  });
});
