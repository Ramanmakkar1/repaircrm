"use server";

import { cancelWithCredentials, cancelWithToken } from "@/lib/account-deletion/cancel";

/**
 * Public: nobody in a shop that is pending deletion can sign in, so keeping
 * the shop has to work signed out. Refusals come back as data.
 */

export async function keepShopWithTokenAction(token: unknown): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  if (typeof token !== "string") return { ok: false, error: "This link no longer works." };
  return cancelWithToken(token);
}

export async function keepShopWithPasswordAction(input: unknown): Promise<{ ok: true; shopName: string } | { ok: false; error: string }> {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string).slice(0, 512) : "");
  return cancelWithCredentials({ email: text("email"), password: text("password"), totp: text("totp") });
}
