import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runAllJobs } from "@/lib/jobs";

/**
 * GET|POST /api/cron — the external scheduler's entry point.
 *
 * Runs exactly what the in-app timer runs (see instrumentation.ts) and answers
 * with the run summary as JSON. Point cron-job.org, a Vercel Cron, a GitHub
 * Action, or any uptime pinger at it:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron
 *     curl "https://…/api/cron?secret=$CRON_SECRET"
 *
 * GET and POST both work because schedulers disagree about which to use, and
 * refusing one of them is a support ticket rather than a security control.
 *
 * ---------------------------------------------------------------------------
 * AUTH
 * ---------------------------------------------------------------------------
 * A shared secret in `CRON_SECRET`, compared in constant time.
 *
 * When it is unset the endpoint answers 503, not 401 and not 200. Unset means
 * "this deployment has not been configured for external cron" — which is a
 * different fact from "your credential was wrong", and an endpoint that ran
 * the jobs for anyone who found the URL would be an unauthenticated way to
 * generate invoices and send customer email.
 *
 * The header form is preferred; `?secret=` exists because a good few
 * schedulers cannot send headers, and it is accepted knowing the cost: query
 * strings turn up in access logs and referrers. Documented, not hidden.
 * ---------------------------------------------------------------------------
 */

// Always run this on demand — a cached cron endpoint is a cron that stopped.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        error: "cron endpoint disabled — set CRON_SECRET",
        hint: "Add CRON_SECRET to the server environment, then send it as 'Authorization: Bearer <secret>'.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!matches(presentedSecret(request), secret)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const summary = await runAllJobs("cron-endpoint");

  // 200 even when `errors` is non-empty: the run itself completed, and a
  // scheduler that retries on non-2xx would otherwise hammer a shop whose one
  // broken schedule fails every time. The errors are in the body to be read.
  return NextResponse.json(summary, { headers: NO_STORE });
}

/** Bearer header first, `?secret=` second. */
function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  return new URL(request.url).searchParams.get("secret");
}

/**
 * Constant-time comparison.
 *
 * Both sides are hashed to a fixed 32 bytes first. `timingSafeEqual` throws on
 * a length mismatch — and that throw would itself leak the secret's length, so
 * comparing digests rather than raw strings removes the question entirely.
 */
function matches(presented: string | null, expected: string): boolean {
  if (!presented) return false;
  return timingSafeEqual(sha256(presented), sha256(expected));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
