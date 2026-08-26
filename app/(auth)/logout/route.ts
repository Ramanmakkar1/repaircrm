import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";

/**
 * Sign-out endpoint. Works as a plain link (<a href="/logout">) or a form POST.
 * The session cookie is cleared, then we bounce to /login.
 */
async function signOut(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 so a POST turns into a GET on /login.
    status: 303,
  });
}

export async function GET(request: Request) {
  return signOut(request);
}

export async function POST(request: Request) {
  return signOut(request);
}
