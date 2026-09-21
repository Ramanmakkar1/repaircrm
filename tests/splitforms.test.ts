import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { leadFromSubmission, readSplitforms, splitformsSignatureValid } from "@/lib/splitforms";

const payload = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  event: "submission.created",
  submission: { id: "sub_123", form_name: "Repair quote", data, created_at: "2026-09-21T19:00:00Z", ...extra },
});

describe("leadFromSubmission", () => {
  it("maps the usual field names, whatever the shop called them", () => {
    expect(
      leadFromSubmission(
        payload({ "Full Name": "Sam Lee", "E-mail": "SAM@Example.com", Mobile: "780 555 0142", Comments: "Cracked screen" }),
      ),
    ).toEqual({
      name: "Sam Lee",
      email: "sam@example.com",
      phone: "780 555 0142",
      message: "Cracked screen",
      source: "Splitforms · Repair quote",
      submissionId: "sub_123",
    });
  });

  it("joins first and last name, and keeps every extra field under the message", () => {
    const lead = leadFromSubmission(
      payload({ first_name: "Ana", last_name: "Diaz", email: "ana@x.co", device: "iPhone 13", "Preferred day": "Friday" }),
    );
    expect(lead?.name).toBe("Ana Diaz");
    expect(lead?.message).toBe("device: iPhone 13\nPreferred day: Friday");
  });

  it("drops captcha tokens and reserved fields — they are not the customer's words", () => {
    const lead = leadFromSubmission(
      payload({ name: "Bo", email: "bo@x.co", "g-recaptcha-response": "x".repeat(500), access_key: "k", _gotcha: "" }),
    );
    expect(lead?.message).toBeNull();
  });

  it("refuses anything that is not a submission", () => {
    expect(leadFromSubmission({})).toBeNull();
    expect(leadFromSubmission({ submission: { data: [] } })).toBeNull();
    expect(leadFromSubmission("nope")).toBeNull();
  });

  it("falls back sensibly when the form had no name field", () => {
    expect(leadFromSubmission(payload({ email: "x@y.co" }))?.name).toBe("x@y.co");
    expect(leadFromSubmission(payload({ question: "hi" }))?.name).toBe("Website visitor");
  });
});

describe("splitformsSignatureValid", () => {
  const body = JSON.stringify(payload({ name: "Sam" }));
  const secret = "whsec_test_1234567890";
  const good = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts exactly what Splitforms signs", async () => {
    expect(await splitformsSignatureValid(body, good, secret)).toBe(true);
  });

  it("rejects a missing, wrong or tampered signature", async () => {
    expect(await splitformsSignatureValid(body, null, secret)).toBe(false);
    expect(await splitformsSignatureValid(body, good, "other-secret-123456")).toBe(false);
    expect(await splitformsSignatureValid(body + " ", good, secret)).toBe(false);
  });
});

describe("readSplitforms", () => {
  it("ignores a missing or malformed config", () => {
    expect(readSplitforms(null)).toBeNull();
    expect(readSplitforms({ splitforms: { token: "short" } })).toBeNull();
    expect(readSplitforms({ splitforms: { token: "a".repeat(64) } })?.secret).toBeNull();
  });
});
