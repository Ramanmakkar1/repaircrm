"use server";

import { redirect } from "next/navigation";

import { login, signOutCurrentUser, signup } from "@/lib/auth";

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
  const target = safeRedirectTarget(formData.get("redirectTo"));

  const result = await login(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? "")
  );

  if (result.status === "error") return { error: result.error };

  // redirect() throws — keep it out of any try/catch.
  if (result.status === "2fa") {
    // The password was right but no session exists yet; the pending cookie
    // login() just set is what /login/verify trades for one.
    redirect(`/login/verify?next=${encodeURIComponent(target)}`);
  }

  redirect(target);
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

  redirect("/");
}

/** Server Action form of sign-out. There is also a GET/POST route at /logout. */
export async function logoutAction(): Promise<void> {
  await signOutCurrentUser();
  redirect("/login");
}
