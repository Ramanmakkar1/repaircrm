import { beforeAll, describe, expect, it, vi } from "vitest";

import { opensInSystemBrowser } from "@/lib/native-app";
import { browserTarget, openBrowserPass, sealBrowserPass } from "@/lib/native/browser-pass";
import { verifySession, type SessionUser } from "@/lib/session";

const session: SessionUser = { userId: "u1", shopId: "s1", role: "OWNER", name: "Owner", email: "o@example.com", pv: 0 };

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-browser-pass-0123456789abcdef";
});

describe("which paths open in the system browser", () => {
  it.each([
    "/api/exports/invoices.csv",
    "/print/invoices/abc",
    "/files/att_1",
    "/time-clock/export",
    "/customers/import/sample",
  ])("%s → browser", (path) => expect(opensInSystemBrowser(path)).toBe(true));

  it.each(["/", "/tickets", "/api/exports/", "/print", "/settings", "/time-clock", "/time-clock/exports", "//evil.test/files/x", "/api/auth/google/start"])(
    "%s → stays in the app",
    (path) => expect(opensInSystemBrowser(path)).toBe(false),
  );

  it("rejects off-site and malformed targets", () => {
    expect(browserTarget("https://evil.test/api/exports/x.csv")).toBeNull();
    expect(browserTarget("//evil.test/api/exports/x.csv")).toBeNull();
    expect(browserTarget("/api/exports/../settings")).toBeNull();
    expect(browserTarget("/api/exports/invoices.csv?from=2026-01-01")).toEqual({
      pathname: "/api/exports/invoices.csv",
      target: "/api/exports/invoices.csv?from=2026-01-01",
    });
  });
});

describe("browser pass", () => {
  it("carries a short-lived session for exactly the requested path, once", async () => {
    const pass = await sealBrowserPass(session, "/api/exports/invoices.csv?from=2026-01-01");
    expect(pass).toBeTruthy();
    // Encrypted (a five-part JWE), not just signed: the session token inside is unreadable.
    const parts = String(pass).split(".");
    expect(parts).toHaveLength(5);
    expect(JSON.parse(Buffer.from(parts[0], "base64url").toString())).toEqual({ alg: "dir", enc: "A256GCM" });

    const opened = await openBrowserPass(pass);
    expect(opened).toMatchObject({ pathname: "/api/exports/invoices.csv", target: "/api/exports/invoices.csv?from=2026-01-01" });
    const user = await verifySession(opened?.token);
    expect(user).toMatchObject({ userId: "u1", shopId: "s1" });

    // The token inside expires in 15 minutes, not the app's seven days.
    const [, claims] = String(opened?.token).split(".");
    const { iat, exp } = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(exp - iat).toBe(15 * 60);

    expect(await openBrowserPass(pass)).toBeNull(); // single use
  });

  it("refuses paths outside the list", async () => {
    expect(await sealBrowserPass(session, "/settings")).toBeNull();
    expect(await sealBrowserPass(session, "https://evil.test/print/x")).toBeNull();
  });

  it("refuses tampered and expired passes", async () => {
    const pass = String(await sealBrowserPass(session, "/print/invoices/1"));
    expect(await openBrowserPass(`${pass.slice(0, -4)}AAAA`)).toBeNull();
    expect(await openBrowserPass("garbage")).toBeNull();

    vi.useFakeTimers();
    try {
      const old = String(await sealBrowserPass(session, "/print/invoices/2"));
      vi.setSystemTime(Date.now() + 2 * 60_000);
      expect(await openBrowserPass(old)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /api/auth/native/browser", () => {
  it("sets a path-scoped cookie and redirects to the target", async () => {
    const { GET } = await import("@/app/api/auth/native/browser/route");
    const pass = String(await sealBrowserPass(session, "/api/exports/customers.csv"));
    const response = await GET(new Request(`https://repairshelper.com/api/auth/native/browser?pass=${encodeURIComponent(pass)}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/\/api\/exports\/customers\.csv$/);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^rf_session=/);
    expect(cookie).toMatch(/Path=\/api\/exports\/customers\.csv/);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("answers an expired pass with a plain message and no cookie", async () => {
    const { GET } = await import("@/app/api/auth/native/browser/route");
    const response = await GET(new Request("https://repairshelper.com/api/auth/native/browser?pass=nope"));
    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
