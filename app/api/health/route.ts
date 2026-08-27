import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Liveness + readiness probe for load balancers, uptime monitors, and
// container orchestrators. Unauthenticated by design: it reveals nothing
// beyond "the app and its database are reachable".
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, reason: "database unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
