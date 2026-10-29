import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  nativeReturnUrl,
  openHandoff,
  sealHandoff,
  validChallenge,
} from "@/lib/google/native-handoff";
import { startFlow, verifyState } from "@/lib/google/oidc";

const verifier = "v".repeat(20) + "erifier-only-the-app-holds-123";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const session = { name: "rf_session", value: "signed.session.jwt", maxAge: 604800 };

describe("Google sign-in hand-off to the native app", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret-that-is-long-enough-for-signed-oauth-state");
    vi.stubEnv("GOOGLE_CLIENT_ID", "repairpilot-test.apps.googleusercontent.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairpilot.example");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("carries the app's challenge through the signed state", async () => {
    const flow = await startFlow({ intent: { kind: "signin" }, next: "/counter", native: challenge });
    const state = await verifyState(new URL(flow.authorizeUrl).searchParams.get("state"));
    expect(state?.native).toBe(challenge);

    const web = await startFlow({ intent: { kind: "signin" }, next: "/counter" });
    const webState = await verifyState(new URL(web.authorizeUrl).searchParams.get("state"));
    expect(webState?.native).toBeUndefined();
  });

  it("accepts only a 43-character S256 challenge", () => {
    expect(validChallenge(challenge)).toBe(true);
    expect(validChallenge("short")).toBe(false);
    expect(validChallenge(`${challenge}!`)).toBe(false);
    expect(validChallenge(null)).toBe(false);
  });

  it("opens with the right verifier and hands back the session cookie and path", async () => {
    const handoff = await sealHandoff({ challenge, cookies: [session], next: "/tickets" });
    expect(handoff).not.toContain(session.value);
    expect(await openHandoff(handoff, verifier)).toEqual({ cookies: [session], next: "/tickets" });
  });

  it("refuses a wrong verifier, a tampered token, and an expired one", async () => {
    const handoff = await sealHandoff({ challenge, cookies: [session], next: "/tickets" });
    expect(await openHandoff(handoff, `${verifier}x`)).toBeNull();
    expect(await openHandoff(`${handoff.slice(0, -4)}AAAA`, verifier)).toBeNull();
    expect(await openHandoff(handoff, null)).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    expect(await openHandoff(handoff, verifier)).toBeNull();
  });

  it("never carries other cookies or an off-site destination", async () => {
    const handoff = await sealHandoff({
      challenge,
      cookies: [session, { name: "rf_portal", value: "x", maxAge: 60 }],
      next: "https://evil.example/",
    });
    expect(await openHandoff(handoff, verifier)).toEqual({ cookies: [session], next: "/" });
  });

  it("returns to the app's own scheme", () => {
    const url = new URL(nativeReturnUrl({ handoff: "abc", next: "/login?google=cancelled" }));
    expect(url.protocol).toBe("com.repairshelper.app:");
    expect(url.searchParams.get("handoff")).toBe("abc");
    expect(url.searchParams.get("next")).toBe("/login?google=cancelled");
  });
});
