import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyCheckoutSession,
  applyPaymentIntent,
  idOf,
  signPayload,
  SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from "@/lib/payments/webhook";
import { settleStripePayment } from "@/lib/payments/settle";

vi.mock("@/lib/payments/settle", () => ({
  settleStripePayment: vi.fn(async () => ({
    status: "recorded",
    paymentId: "pay_new",
    invoiceStatus: "PAID",
  })),
}));

/**
 * The Stripe webhook — POST /api/webhooks/stripe.
 *
 * The endpoint is unauthenticated by design and authenticated by signature: the
 * HMAC over the RAW body is the only thing standing between a stranger with the
 * URL and an invoice marked paid. The verification itself lives in
 * lib/payments/webhook.ts, which app/api/webhooks/stripe/route.ts calls once per
 * candidate secret; everything below tests it directly.
 *
 * `signPayload` is the module's own test helper — it signs exactly the way
 * Stripe does — so a passing forgery here would be a passing forgery in
 * production.
 */

const SECRET = "whsec_test_secret";
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });
const NOW_MS = 1_760_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

describe("verifyStripeSignature — accepting", () => {
  it("accepts a signature Stripe would have produced", () => {
    const header = signPayload(PAYLOAD, SECRET, NOW_S);

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: true, timestamp: NOW_S });
  });

  it("signs `${timestamp}.${payload}`, which is what makes the timestamp binding", () => {
    const expected = createHmac("sha256", SECRET)
      .update(`${NOW_S}.${PAYLOAD}`, "utf8")
      .digest("hex");

    expect(signPayload(PAYLOAD, SECRET, NOW_S)).toBe(`t=${NOW_S},v1=${expected}`);
  });

  it("tolerates whitespace around the header parts", () => {
    const header = signPayload(PAYLOAD, SECRET, NOW_S).replace(",", " , ");

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);
  });

  it("ignores signature schemes it does not understand (v0, and future ones)", () => {
    const header = `${signPayload(PAYLOAD, SECRET, NOW_S)},v0=deadbeef`;

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);
  });
});

describe("verifyStripeSignature — rejecting a forgery", () => {
  it("rejects a wrong signature", () => {
    const header = `t=${NOW_S},v1=${"0".repeat(64)}`;

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const header = signPayload(PAYLOAD, "whsec_someone_elses_secret", NOW_S);

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });

  it("rejects a payload edited after signing — one byte is enough", () => {
    const header = signPayload(PAYLOAD, SECRET, NOW_S);
    const tampered = PAYLOAD.replace("evt_1", "evt_2");

    expect(
      verifyStripeSignature({
        payload: tampered,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });

  it("rejects a re-serialised body, which is why the route reads request.text()", () => {
    // `await request.json()` then JSON.stringify() gives back different
    // whitespace and key order, and the HMAC never verifies again.
    const original = '{"id":"evt_1",  "type":"payment_intent.succeeded"}';
    const header = signPayload(original, SECRET, NOW_S);
    const reSerialised = JSON.stringify(JSON.parse(original));

    expect(reSerialised).not.toBe(original);
    expect(
      verifyStripeSignature({
        payload: reSerialised,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });

  it("rejects a signature lifted from a DIFFERENT timestamp on the same body", () => {
    // The header's `t` is fed into the HMAC, so replaying the digest under a
    // fresher timestamp does not verify.
    const header = signPayload(PAYLOAD, SECRET, NOW_S - 1_000);
    const digest = header.split("v1=")[1];

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v1=${digest}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a missing header", () => {
    expect(
      verifyStripeSignature({ payload: PAYLOAD, header: null, secret: SECRET }),
    ).toEqual({ ok: false, reason: "missing signature header" });
  });

  it("rejects an unconfigured secret rather than accepting an unsigned payload", () => {
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: signPayload(PAYLOAD, SECRET, NOW_S),
        secret: "",
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "webhook secret is not set" });
  });

  it("rejects a header with no timestamp", () => {
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `v1=${"a".repeat(64)}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "malformed signature header" });
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=not-a-time,v1=${"a".repeat(64)}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "malformed signature header" });
  });

  it("rejects a header carrying no v1 signature at all", () => {
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v0=deadbeef`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "no v1 signature" });
  });

  it("rejects garbage without throwing", () => {
    for (const header of ["", "nonsense", "t=,v1=", "=,=", ",,,"]) {
      expect(
        verifyStripeSignature({
          payload: PAYLOAD,
          header,
          secret: SECRET,
          nowMs: NOW_MS,
        }).ok,
      ).toBe(false);
    }
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // `timingSafeEqual` throws on a length mismatch; the length is checked
    // first, and a length difference leaks nothing because v1 is always 64 hex.
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v1=abc`,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });
});

describe("verifyStripeSignature — replay window", () => {
  it("uses Stripe's own five-minute default", () => {
    expect(SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });

  it("accepts a signature right at the edge of the window", () => {
    for (const offset of [SIGNATURE_TOLERANCE_SECONDS, -SIGNATURE_TOLERANCE_SECONDS]) {
      const stamp = NOW_S - offset;
      expect(
        verifyStripeSignature({
          payload: PAYLOAD,
          header: signPayload(PAYLOAD, SECRET, stamp),
          secret: SECRET,
          nowMs: NOW_MS,
        }).ok,
      ).toBe(true);
    }
  });

  it("REJECTS A REPLAY: a perfectly valid capture, replayed tomorrow", () => {
    const captured = signPayload(PAYLOAD, SECRET, NOW_S);

    // Same bytes, same signature, verified a day later.
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: captured,
        secret: SECRET,
        nowMs: NOW_MS + 86_400_000,
      }),
    ).toEqual({ ok: false, reason: "timestamp outside tolerance" });
  });

  it("rejects one second past the window in either direction", () => {
    for (const offset of [301, -301]) {
      const stamp = NOW_S - offset;
      expect(
        verifyStripeSignature({
          payload: PAYLOAD,
          header: signPayload(PAYLOAD, SECRET, stamp),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      ).toEqual({ ok: false, reason: "timestamp outside tolerance" });
    }
  });

  it("rejects a FUTURE timestamp as firmly as a stale one", () => {
    const stamp = NOW_S + 3_600;

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: signPayload(PAYLOAD, SECRET, stamp),
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });

  it("honours an explicit tolerance override", () => {
    const stamp = NOW_S - 600;
    const header = signPayload(PAYLOAD, SECRET, stamp);

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header,
        secret: SECRET,
        nowMs: NOW_MS,
        toleranceSeconds: 900,
      }).ok,
    ).toBe(true);
  });
});

describe("verifyStripeSignature — secret rotation", () => {
  it("accepts when ANY of the repeated v1 entries matches", () => {
    // Stripe signs with both secrets during a rotation. Accepting only the
    // first would drop payments on the floor for the length of the overlap.
    const oldSignature = signPayload(PAYLOAD, "whsec_old", NOW_S).split("v1=")[1];
    const newSignature = signPayload(PAYLOAD, SECRET, NOW_S).split("v1=")[1];

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v1=${oldSignature},v1=${newSignature}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);

    // Order must not matter.
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v1=${newSignature},v1=${oldSignature}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(true);
  });

  it("still rejects when none of them matches", () => {
    const a = signPayload(PAYLOAD, "whsec_a", NOW_S).split("v1=")[1];
    const b = signPayload(PAYLOAD, "whsec_b", NOW_S).split("v1=")[1];

    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${NOW_S},v1=${a},v1=${b}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }).ok,
    ).toBe(false);
  });
});

describe("idOf", () => {
  it("unwraps an id whether Stripe expanded the object or not", () => {
    expect(idOf("pi_123")).toBe("pi_123");
    expect(idOf({ id: "pi_123" })).toBe("pi_123");
    expect(idOf({})).toBeNull();
    expect(idOf(null)).toBeNull();
    expect(idOf(undefined)).toBeNull();
  });
});

describe("applyCheckoutSession", () => {
  beforeEach(() => {
    vi.mocked(settleStripePayment).mockClear();
  });

  const paidSession = {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 11_000,
    payment_intent: "pi_test_1",
    metadata: { invoiceId: "inv_1", shopId: "shop_1" },
  };

  it("settles a paid session against its invoice", async () => {
    await applyCheckoutSession(paidSession);

    expect(settleStripePayment).toHaveBeenCalledWith({
      shopId: "shop_1",
      invoiceId: "inv_1",
      amountCents: 11_000,
      // The SESSION id stays the reference: it is the handle staff read back
      // to Stripe support, and pre-Wave-8 rows carry it.
      reference: "cs_test_1",
      paymentIntentId: "pi_test_1",
      chargeId: null,
      source: "checkout",
    });
  });

  it("refuses a session with no id", async () => {
    const outcome = await applyCheckoutSession({ ...paidSession, id: "  " });
    expect(outcome).toEqual({ status: "ignored", reason: "session has no id" });
    expect(settleStripePayment).not.toHaveBeenCalled();
  });

  it("ignores a session that is complete but NOT PAID", async () => {
    // "complete" can also mean the bank debit is still pending.
    const outcome = await applyCheckoutSession({
      ...paidSession,
      payment_status: "unpaid",
    });

    expect(outcome).toEqual({ status: "ignored", reason: "payment_status=unpaid" });
    expect(settleStripePayment).not.toHaveBeenCalled();
  });

  it("accepts no_payment_required", async () => {
    await applyCheckoutSession({
      ...paidSession,
      payment_status: "no_payment_required",
    });
    expect(settleStripePayment).toHaveBeenCalled();
  });

  it("ignores a session that is not one of ours", async () => {
    for (const metadata of [null, {}, { invoiceId: "inv_1" }, { shopId: "shop_1" }]) {
      vi.mocked(settleStripePayment).mockClear();
      const outcome = await applyCheckoutSession({ ...paidSession, metadata });
      expect(outcome).toEqual({
        status: "ignored",
        reason: "session is not one of ours",
      });
      expect(settleStripePayment).not.toHaveBeenCalled();
    }
  });

  it("lets a Connect account id BEAT the metadata's shopId", async () => {
    // An account id this app stored itself is a stronger claim than metadata
    // that rode in on the event.
    await applyCheckoutSession(paidSession, "shop_from_connected_account");

    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_from_connected_account" }),
    );
  });

  it("falls back to metadata when the override is blank", async () => {
    await applyCheckoutSession(paidSession, "   ");
    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_1" }),
    );
  });

  it("unwraps an expanded payment_intent object", async () => {
    await applyCheckoutSession({
      ...paidSession,
      payment_intent: { id: "pi_expanded" },
    });

    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_expanded" }),
    );
  });

  it("treats a missing amount as zero, which settle then ignores", async () => {
    await applyCheckoutSession({ ...paidSession, amount_total: null });
    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 0 }),
    );
  });
});

describe("applyPaymentIntent", () => {
  beforeEach(() => {
    vi.mocked(settleStripePayment).mockClear();
  });

  const succeeded = {
    id: "pi_test_1",
    status: "succeeded",
    amount: 11_000,
    amount_received: 11_000,
    latest_charge: "ch_test_1",
    metadata: { invoiceId: "inv_1", shopId: "shop_1" },
  };

  it("settles a succeeded intent, keyed on the intent id twice over", async () => {
    await applyPaymentIntent(succeeded);

    expect(settleStripePayment).toHaveBeenCalledWith({
      shopId: "shop_1",
      invoiceId: "inv_1",
      amountCents: 11_000,
      reference: "pi_test_1",
      // Written to the column as well: this is what lets a Checkout session's
      // row dedupe against the PaymentIntent event that follows it.
      paymentIntentId: "pi_test_1",
      chargeId: "ch_test_1",
      source: "checkout",
    });
  });

  it("ignores an intent that has not succeeded", async () => {
    for (const status of ["requires_payment_method", "processing", "canceled", null]) {
      vi.mocked(settleStripePayment).mockClear();
      const outcome = await applyPaymentIntent({ ...succeeded, status });
      expect(outcome.status).toBe("ignored");
      expect(settleStripePayment).not.toHaveBeenCalled();
    }
  });

  it("prefers amount_received over the authorised amount", async () => {
    await applyPaymentIntent({ ...succeeded, amount: 11_000, amount_received: 9_000 });

    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 9_000 }),
    );
  });

  it("falls back to `amount` when amount_received is absent", async () => {
    await applyPaymentIntent({ ...succeeded, amount_received: null });

    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 11_000 }),
    );
  });

  it("carries this app's own source stamp through, and defaults the rest", async () => {
    for (const [stamped, expected] of [
      ["terminal", "terminal"],
      ["card_on_file", "card_on_file"],
      ["checkout", "checkout"],
      ["something_else", "checkout"],
      [undefined, "checkout"],
    ] as const) {
      vi.mocked(settleStripePayment).mockClear();
      await applyPaymentIntent({
        ...succeeded,
        metadata: { ...succeeded.metadata, source: stamped },
      });
      expect(settleStripePayment).toHaveBeenCalledWith(
        expect.objectContaining({ source: expected }),
      );
    }
  });

  it("ignores an intent that is not one of ours", async () => {
    const outcome = await applyPaymentIntent({ ...succeeded, metadata: {} });
    expect(outcome).toEqual({
      status: "ignored",
      reason: "intent is not one of ours",
    });
    expect(settleStripePayment).not.toHaveBeenCalled();
  });

  it("lets a Connect account id beat the metadata's shopId", async () => {
    await applyPaymentIntent(succeeded, "shop_from_connected_account");

    expect(settleStripePayment).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_from_connected_account" }),
    );
  });
});
