"use server";

import { redirect } from "next/navigation";

import { signOutCurrentUser } from "@/lib/auth";

/**
 * Sign-out Server Action, for a button in the app shell:
 *
 *   import { logout } from "@/lib/auth-actions";
 *   <form action={logout}><button type="submit">Sign out</button></form>
 *
 * There is also a plain endpoint at /logout (GET or POST) if a link is easier.
 */
export async function logout(): Promise<void> {
  await signOutCurrentUser();
  redirect("/login");
}
