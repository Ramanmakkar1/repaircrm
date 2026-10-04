import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn(),
  session: vi.fn(), user: vi.fn(), admin: vi.fn(), limit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { productFeedback: { create: mocks.create, updateMany: mocks.update, findMany: mocks.findMany, count: mocks.count } } }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session, requireUser: mocks.user }));
vi.mock("@/lib/platform-admin", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.8" }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit, retryAfterLabel: () => "in about 10 minutes" }));
import { submitFeedbackAction } from "@/app/feedback/actions";
import { updateFeedbackStatusAction } from "@/app/platform/feedback/actions";
import FeedbackInbox from "@/app/platform/feedback/page";

function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ kind: "BUG", title: "Pickup list issue", detail: "The ready-for-pickup list does not show the expected device.", email: "", page: "Counter", ...extra })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockReturnValue({ allowed: true });
  mocks.session.mockResolvedValue(null);
  mocks.user.mockResolvedValue({ userId: "trusted-user", shopId: "trusted-shop" });
  mocks.admin.mockResolvedValue({ id: "operator" });
  mocks.create.mockResolvedValue({ id: "feedback-1" });
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
describe("feedback submission", () => {
  it("saves an anonymous report with optional fields and no invented attribution", async () => {
    expect(await submitFeedbackAction({}, form())).toEqual({ success: true });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ kind: "BUG", email: null, reporterUserId: null, reporterShopId: null });
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("gets signed-in attribution from a live guarded account, never the form", async () => {
    mocks.session.mockResolvedValue({ userId: "cookie-user", shopId: "cookie-shop" });
    await submitFeedbackAction({}, form({ kind: "FEATURE", userId: "spoof", shopId: "other-shop", email: " owner@example.com " }));
    expect(mocks.user).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ kind: "FEATURE", email: "owner@example.com", reporterUserId: "trusted-user", reporterShopId: "trusted-shop" });
  });
  it.each([{ kind: "ADMIN" }, { title: "x" }, { detail: "x" }, { detail: "a".repeat(4001) }, { email: "invalid" }] as Record<string, string>[])("rejects invalid content before writing: %s", async (invalid) => {
    const result = await submitFeedbackAction({}, form(invalid));
    expect(result.error).toBeTruthy();
    expect(result.values).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps a draft on storage failure and does not claim success", async () => {
    mocks.create.mockRejectedValueOnce(new Error("internal DB information"));
    const result = await submitFeedbackAction({}, form());
    expect(result.success).toBeUndefined();
    expect(result.error).not.toContain("internal DB information");
    expect(result.values?.title).toBe("Pickup list issue");
  });
  it("refuses rate-limited writes and silently ignores honeypot spam", async () => {
    mocks.limit.mockReturnValue({ allowed: false, retryAfterMs: 600000 });
    expect((await submitFeedbackAction({}, form())).error).toContain("10 minutes");
    expect(await submitFeedbackAction({}, form({ website: "spam" }))).toEqual({ success: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
describe("platform feedback management", () => {
  it("requires platform authorization before reading or updating reports", async () => {
    mocks.admin.mockRejectedValue(new Error("Not a platform administrator"));
    await expect(FeedbackInbox({ searchParams: Promise.resolve({}) })).rejects.toThrow("Not a platform");
    await expect(updateFeedbackStatusAction(form({ id: "feedback-1", status: "CLOSED" }))).rejects.toThrow("Not a platform");
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses empty ids and unknown statuses instead of widening an update", async () => {
    await expect(updateFeedbackStatusAction(form({ id: "", status: "CLOSED" }))).rejects.toThrow();
    await expect(updateFeedbackStatusAction(form({ id: "feedback-1", status: "DELETE" }))).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
    await updateFeedbackStatusAction(form({ id: "feedback-1", status: "IN_REVIEW" }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "feedback-1" }, data: { status: "IN_REVIEW" } });
  });
  it("escapes user content in the private inbox", async () => {
    mocks.findMany.mockResolvedValue([{ id: "report", kind: "BUG", status: "NEW", title: "<script>bad()</script>", detail: "<img src=x onerror=bad()>", email: null, page: null, reporterUserId: null, createdAt: new Date("2026-10-04T20:00:00Z") }]);
    mocks.count.mockResolvedValue(1);
    const html = renderToStaticMarkup(await FeedbackInbox({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>bad()");
    expect(html).not.toContain("<img src=x");
  });
});
