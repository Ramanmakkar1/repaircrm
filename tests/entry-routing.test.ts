import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ signedIn: false, login: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => ({ value: name === "rf_home_tab" ? "stock" : JSON.stringify({ simple: false, taskHomeVersion: 1 }) }) }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { state.redirect(path); throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/auth", () => ({ getSession: async () => state.signedIn ? { userId: "test-user" } : null, login: state.login, signup: vi.fn(), signOutCurrentUser: vi.fn() }));
vi.mock("@/components/landing/repairs-home", () => ({ RepairsHome: () => null }));

import RootPage from "@/app/page";
import LoginPage from "@/app/(auth)/login/page";
import { loginAction } from "@/app/(auth)/actions";

beforeEach(() => { state.signedIn = false; state.login.mockReset(); state.redirect.mockClear(); });

function form(redirectTo?: string) {
  const data = new FormData();
  data.set("email", "test@example.test"); data.set("password", "test-password");
  if (redirectTo) data.set("redirectTo", redirectTo);
  return data;
}

describe("Counter entry routes", () => {
  it("sends an existing session from the root to Counter even with a Full view cookie", async () => {
    state.signedIn = true;
    await expect(RootPage()).rejects.toThrow("redirect:/counter?tab=counter");
    expect(state.redirect).toHaveBeenCalledWith("/counter?tab=counter");
  });
  it("keeps the public homepage available to signed-out visitors", async () => {
    expect(await RootPage()).toBeTruthy();
    expect(state.redirect).not.toHaveBeenCalled();
  });
  it("sends an already signed-in person from Login directly to Counter", async () => {
    state.signedIn = true;
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/counter?tab=counter");
  });
  it.each([undefined, "https://example.test", "//example.test"])("defaults a successful login to Counter for target %s", async (target) => {
    state.login.mockResolvedValue({ status: "ok" });
    await expect(loginAction(undefined, form(target))).rejects.toThrow("redirect:/counter?tab=counter");
  });
  it("preserves a requested repair deep link after authentication", async () => {
    state.login.mockResolvedValue({ status: "ok" });
    await expect(loginAction(undefined, form("/tickets/test-repair"))).rejects.toThrow("redirect:/tickets/test-repair");
  });
  it("carries the Counter destination through two-factor authentication", async () => {
    state.login.mockResolvedValue({ status: "2fa" });
    await expect(loginAction(undefined, form())).rejects.toThrow("redirect:/login/verify?next=%2Fcounter%3Ftab%3Dcounter");
  });
  it("keeps a failed sign-in on its form", async () => {
    state.login.mockResolvedValue({ status: "error", error: "Invalid credentials" });
    expect(await loginAction(undefined, form())).toEqual({ error: "Invalid credentials" });
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
