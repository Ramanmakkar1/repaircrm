"use server";

import { redirect } from "next/navigation";

import { destroySession, login, signup } from "@/lib/auth";

export type AuthFormState = { error?: string } | undefined;

function safeRedirectTarget(value: FormDataEntryValue | null): string {
  const target = typeof value === "string" ? value : "";
  // Only allow same-origin, non-protocol-relative paths.
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const result = await login(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? "")
  );

  if (!result.ok) return { error: result.error };

  // redirect() throws — keep it out of any try/catch.
  redirect(safeRedirectTarget(formData.get("redirectTo")));
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const result = await signup({
    shopName: String(formData.get("shopName") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) return { error: result.error };

  // A brand new shop goes to the setup wizard, not the (empty) dashboard.
  redirect("/setup");
}

/** Server Action form of sign-out. There is also a GET/POST route at /logout. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
