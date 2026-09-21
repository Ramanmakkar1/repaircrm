import { beforeEach, describe, expect, it, vi } from "vitest";

import { handlers, resetDb } from "./helpers/db-mock";

/**
 * "Notify: ready for pickup" must tell the front desk what really happened.
 * It used to report "Customer told" for a customer with no address, one who
 * opted out, and a provider that refused — all of whom were never told.
 */

const { sendSmsMock, sendEmailMock } = vi.hoisted(() => ({
  sendSmsMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Dana" })),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({
  emitTicketEvent: vi.fn(async () => {}),
  emitInvoiceEvent: vi.fn(async () => {}),
  emitPaymentEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/comms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comms")>()),
  sendSms: sendSmsMock,
  sendEmail: sendEmailMock,
}));

const { notifyReadyForPickupAction } = await import("@/app/(app)/tickets/actions");

function ticket(customer: { smsOptIn: boolean; mobile: string | null }) {
  handlers["ticket.findFirst"] = () => ({
    id: "t1",
    number: 1042,
    subject: "Screen",
    status: "In Progress",
    customerId: "c1",
    customer: { firstName: "Sam", ...customer },
  });
}

beforeEach(() => {
  resetDb();
  sendSmsMock.mockReset();
  sendEmailMock.mockReset();
  handlers["shop.findUnique"] = () => ({ name: "Fix-It" });
  handlers["cannedResponse.findFirst"] = () => ({ body: "Hi {customer}, {ticket} is ready." });
  handlers["ticket.update"] = () => ({});
  handlers["ticketComment.create"] = () => ({});
});

describe("notifyReadyForPickupAction", () => {
  it("says texted only when the text was accepted", async () => {
    ticket({ smsOptIn: true, mobile: "7805550142" });
    sendSmsMock.mockResolvedValue({ ok: true, status: "sent", logId: "l1" });

    const result = await notifyReadyForPickupAction("t1");

    expect(result).toEqual({ ok: true, done: "Marked ready and the customer was texted." });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("falls back to email when the text bounces", async () => {
    ticket({ smsOptIn: true, mobile: "7805550142" });
    sendSmsMock.mockResolvedValue({ ok: false, status: "failed: twilio 400", logId: "l1" });
    sendEmailMock.mockResolvedValue({ ok: true, status: "sent", logId: "l2" });

    const result = await notifyReadyForPickupAction("t1");

    expect(result.done).toBe("Marked ready and the customer was emailed.");
  });

  it("warns — never congratulates — when nobody could be reached", async () => {
    ticket({ smsOptIn: false, mobile: null });
    for (const status of ["skipped: no address", "skipped: opted out", "failed: resend 500", "logged"]) {
      sendEmailMock.mockResolvedValue({ ok: status === "logged", status, logId: "l" });
      const result = await notifyReadyForPickupAction("t1");
      expect(result.ok).toBe(true);
      expect(result.done).toBeUndefined();
      expect(result.notice).toMatch(/Marked ready — .*call/);
    }
  });
});
