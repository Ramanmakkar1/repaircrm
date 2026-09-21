import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { emitLeadEvent } from "@/lib/events";
import { leadFromSubmission, readSplitforms, splitformsSignatureValid } from "@/lib/splitforms";

/**
 * POST /api/integrations/splitforms/<token> — a Splitforms webhook.
 *
 * Answers:
 *   201 lead created · 200 duplicate or test ping (nothing to do)
 *   400 not a Splitforms submission · 401 bad signature · 404 unknown link
 *   429 over the hourly cap
 * Splitforms retries once on a 5xx and never on a 4xx, so every refusal here
 * is a 4xx: a bad request retried is still a bad request.
 */

export const dynamic = "force-dynamic";

/** Splitforms filters spam before it gets here, so this is a runaway guard, not a spam filter. */
const MAX_PER_HOUR = 120;
const MAX_BODY = 256 * 1024;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return reply(404, { ok: false, error: "Unknown link." });

  const shop = await db.shop.findFirst({
    where: { settings: { path: ["splitforms", "token"], equals: token } },
    select: { id: true, settings: true },
  });
  const config = shop ? readSplitforms(shop.settings) : null;
  // The JSON match found it; re-check the exact token so a malformed row can't match loosely.
  if (!shop || !config || config.token !== token) return reply(404, { ok: false, error: "Unknown link." });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(400, { ok: false, error: "Too large." });

  if (config.secret) {
    const valid = await splitformsSignatureValid(raw, request.headers.get("x-splitforms-signature"), config.secret);
    if (!valid) return reply(401, { ok: false, error: "Signature does not match." });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: "Body must be JSON." });
  }
  const event = (payload as { event?: unknown })?.event;
  if (event !== "submission.created") return reply(200, { ok: true, ignored: true });

  const lead = leadFromSubmission(payload);
  if (!lead) return reply(400, { ok: false, error: "Not a Splitforms submission." });

  // A replay from the Splitforms dashboard, or its one automatic retry, must
  // not become a second lead. The submission id rides in the lead's message.
  const marker = lead.submissionId ? `Splitforms ref: ${lead.submissionId}` : null;
  if (marker) {
    const seen = await db.lead.findFirst({
      where: { shopId: shop.id, message: { contains: marker } },
      select: { id: true },
    });
    if (seen) return reply(200, { ok: true, duplicate: true });
  }

  const recent = await db.lead.count({
    where: { shopId: shop.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_PER_HOUR) return reply(429, { ok: false, error: "Too many leads this hour." });

  const created = await db.lead.create({
    data: {
      shopId: shop.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: [lead.message, marker].filter(Boolean).join("\n\n") || null,
      source: lead.source,
      status: "NEW",
    },
    select: { id: true },
  });
  await emitLeadEvent(shop.id, "lead.created", created.id);

  // "Last lead received" on the Leads page — merged, never replacing settings.
  const settings = (shop.settings ?? {}) as Record<string, unknown>;
  await db.shop.update({
    where: { id: shop.id },
    data: {
      settings: {
        ...settings,
        splitforms: { ...config, lastLeadAt: new Date().toISOString() },
      } as Prisma.InputJsonValue,
    },
  });

  return reply(201, { ok: true });
}
