import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { signSquareState, verifySquareState } from "@/lib/payments/square/connect";
import { verifySquareSignature } from "@/lib/payments/square/webhook";

const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "square-test-state-secret-with-enough-entropy";
});

afterEach(() => {
  if (originalSecret === undefined) Reflect.deleteProperty(process.env, "AUTH_SECRET");
  else process.env.AUTH_SECRET = originalSecret;
});

describe("Square OAuth state", () => {
  it("round-trips the tenant and rejects tampering", async () => {
    const state = await signSquareState("shop_123");
    expect(await verifySquareState(state)).toBe("shop_123");
    const corrupted = `${state[0] === "a" ? "b" : "a"}${state.slice(1)}`;
    expect(await verifySquareState(corrupted)).toBeNull();
  });
});

describe("Square webhook signatures", () => {
  it("checks the notification URL plus the exact raw body", () => {
    const key = "square-signature-key";
    const url = "https://repairpilot.example/api/webhooks/square";
    const body = '{"type":"payment.updated"}';
    const signature = createHmac("sha256", key).update(url + body).digest("base64");
    expect(verifySquareSignature({ body, signature, signatureKey: key, notificationUrl: url })).toBe(true);
    expect(verifySquareSignature({ body: `${body} `, signature, signatureKey: key, notificationUrl: url })).toBe(false);
  });
});
