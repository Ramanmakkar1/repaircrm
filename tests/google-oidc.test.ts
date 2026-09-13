import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseIntent,
  safeNextPath,
  startFlow,
  verifyState,
} from "@/lib/google/oidc";

describe("Google OIDC flow", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-secret-that-is-long-enough-for-signed-oauth-state");
    vi.stubEnv("GOOGLE_CLIENT_ID", "repairpilot-test.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOOGLE_AUTH_BASE", "https://accounts.google.test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairpilot.example");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signs the intent and binds the authorization request to PKCE and a nonce", async () => {
    const flow = await startFlow({ intent: { kind: "signup" }, next: "/setup" });
    const authorize = new URL(flow.authorizeUrl);
    const state = await verifyState(authorize.searchParams.get("state"));

    expect(authorize.origin).toBe("https://accounts.google.test");
    expect(authorize.searchParams.get("scope")).toBe("openid email profile");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://repairpilot.example/api/auth/google/callback",
    );
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize.searchParams.get("nonce")).toBe(state?.nonce);
    expect(state).toMatchObject({ intent: { kind: "signup" }, next: "/setup" });
    expect(flow.flowToken).toBeTruthy();
  });

  it("uses the server runtime origin instead of a public URL frozen into the build", async () => {
    vi.stubEnv("APP_URL", "https://runtime.repairpilot.example");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3020");

    const flow = await startFlow({ intent: { kind: "signin" }, next: "/dashboard" });
    const authorize = new URL(flow.authorizeUrl);

    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://runtime.repairpilot.example/api/auth/google/callback",
    );
  });

  it("rejects tampered state", async () => {
    const flow = await startFlow({ intent: { kind: "signin" }, next: "/dashboard" });
    const state = new URL(flow.authorizeUrl).searchParams.get("state")!;
    const [header, payload, signature] = state.split(".");
    const tamperedSignature =
      (signature[0] === "a" ? "b" : "a") + signature.slice(1);

    expect(
      await verifyState(`${header}.${payload}.${tamperedSignature}`),
    ).toBeNull();
  });

  it.each([
    ["https://evil.example", "/"],
    ["//evil.example/path", "/"],
    ["/\\evil.example", "/"],
    ["tickets", "/"],
    ["/tickets?status=open", "/tickets?status=open"],
  ])("normalizes post-login path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("accepts only supported intents and well-formed invite tokens", () => {
    expect(parseIntent("signin")).toEqual({ kind: "signin" });
    expect(parseIntent("link")).toEqual({ kind: "link" });
    expect(parseIntent(`invite:${"a".repeat(32)}`)).toEqual({
      kind: "invite",
      token: "a".repeat(32),
    });
    expect(parseIntent("invite:short")).toBeNull();
    expect(parseIntent("admin")).toBeNull();
  });
});
