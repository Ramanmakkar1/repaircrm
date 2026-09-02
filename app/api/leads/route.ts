import { NextResponse } from "next/server";
import { z } from "zod";

import { DEFAULT_WEB_SOURCE } from "@/components/leads/lead-meta";
import { db } from "@/lib/db";
import { emitLeadEvent } from "@/lib/events";

/**
 * PUBLIC lead capture — the backend for the embeddable "request a quote" form.
 *
 * This is the ONLY unauthenticated write endpoint in the app, so its rules are
 * spelled out rather than implied:
 *
 *   · The tenant is named by SLUG in the body, not by a session. That is safe
 *     because the endpoint can only ever CREATE a Lead for that shop — it reads
 *     nothing back, so a guessed slug leaks nothing beyond "this shop exists",
 *     which is already public (it's on their website).
 *   · CORS is wide open (`*`) — deliberately, and ONLY here. The form lives on
 *     the shop's own domain, which we don't know in advance, and the endpoint
 *     accepts no credentials, so a wildcard costs nothing. Every other route in
 *     the app stays same-origin. (Note the contrast with app/api/v1, which is
 *     server-to-server and allows no browser origin at all.)
 *   · Rate-limit-lite: 20 leads per shop per hour, counted straight off the
 *     table. Not a real limiter — no burst shaping, no per-IP bucket — but it
 *     turns "a bot fills the inbox with 40,000 rows" into "a bot fills it with
 *     20 an hour", which is the difference that matters at this size.
 *   · A honeypot field named `website` silently succeeds without writing. Bots
 *     fill every input they find; humans never see it. Answering 201 (rather
 *     than an error) is the point — a bot that learns it was caught adapts.
 *
 * Accepts JSON, form-encoded and multipart bodies, and always answers JSON.
 */

export const dynamic = "force-dynamic";

const MAX_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

function ok(): NextResponse {
  return json({ ok: true }, 201);
}

function fail(status: number, error: string): NextResponse {
  return json({ ok: false, error }, status);
}

const captureSchema = z.object({
  shop: z.string().trim().min(1, "shop is required").max(60),
  name: z.string().trim().min(1, "name is required").max(120),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(5000).optional(),
  source: z.string().trim().max(60).optional(),
  /** Honeypot. Must stay empty. */
  website: z.string().max(200).optional(),
});

/**
 * Reads the body as a plain record whether it arrived as JSON, as
 * `application/x-www-form-urlencoded`, or as multipart form data — a copy-paste
 * HTML form and a `fetch` with a JSON body should both just work.
 */
async function readBody(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const value = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const out: Record<string, string> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === "string") out[key] = raw;
        else if (typeof raw === "number" || typeof raw === "boolean") {
          out[key] = String(raw);
        }
      }
      return out;
    } catch {
      return null;
    }
  }

  try {
    const formData = await request.formData();
    const out: Record<string, string> = {};
    for (const [key, raw] of formData.entries()) {
      if (typeof raw === "string") out[key] = raw;
    }
    return out;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readBody(request);
  if (!body) return fail(400, "Body must be JSON or form-encoded.");

  // The two required fields are defaulted to "" before parsing so a MISSING
  // key reports "name is required" rather than zod's "expected string,
  // received undefined" — the caller is someone wiring up an HTML form.
  const parsed = captureSchema.safeParse({
    ...body,
    shop: body.shop ?? "",
    name: body.name ?? "",
  });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  const input = parsed.data;

  // Caught bot: look successful, write nothing. Checked BEFORE the shop lookup
  // so a spam run can't use the response to probe which slugs exist.
  if (input.website && input.website.trim() !== "") return ok();

  const shop = await db.shop.findUnique({
    where: { slug: input.shop.toLowerCase() },
    select: { id: true },
  });
  if (!shop) return fail(404, "Unknown shop.");

  const recent = await db.lead.count({
    where: { shopId: shop.id, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
  });
  if (recent >= MAX_PER_HOUR) {
    return fail(429, "Too many submissions. Please try again later.");
  }

  // At least one way to reply, or the lead is a dead row nobody can action.
  if (!input.email && !input.phone) {
    return fail(400, "An email address or a phone number is required.");
  }

  const lead = await db.lead.create({
    data: {
      shopId: shop.id,
      name: input.name,
      email: input.email?.toLowerCase() || null,
      phone: input.phone || null,
      message: input.message || null,
      source: input.source || DEFAULT_WEB_SOURCE,
      status: "NEW",
    },
    select: { id: true },
  });

  await emitLeadEvent(shop.id, "lead.created", lead.id);

  return ok();
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
