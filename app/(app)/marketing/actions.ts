"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formError, type FormState } from "@/components/billing/types";
import {
  BODY_MAX_CHARS,
  MAX_DELAY_DAYS,
  NAME_MAX_CHARS,
  SUBJECT_MAX_CHARS,
  asChannel,
  asTrigger,
  findTemplate,
} from "@/components/marketing/meta";
import {
  countDueSends,
  runDueCampaignSends,
  syncCampaignSends,
  type RunSummary,
  type SyncSummary,
} from "./engine";

/**
 * Marketing mutations.
 *
 * Every entry point resolves the campaign with `findFirst({ id, shopId })`
 * first — a forged id from another tenant 404s rather than mutating a row. The
 * engine itself never sees a shopId that did not come from the session.
 */

function revalidateMarketing(id?: string): void {
  revalidatePath("/marketing");
  if (id) revalidatePath(`/marketing/${id}`);
}

// ---------------------------------------------------------------------------
// Form parsing
// ---------------------------------------------------------------------------

function readDelayDays(formData: FormData): number {
  const parsed = Number.parseInt(String(formData.get("delayDays") ?? ""), 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(Math.max(parsed, 0), MAX_DELAY_DAYS);
}

/** Radix Switch is mirrored into a hidden input, so this reads a string. */
function readActive(formData: FormData): boolean {
  const raw = formData.get("active");
  return raw === "on" || raw === "true" || raw === "1";
}

type CampaignInput = {
  name: string;
  trigger: ReturnType<typeof asTrigger>;
  delayDays: number;
  channel: ReturnType<typeof asChannel>;
  subject: string | null;
  body: string;
  active: boolean;
};

function parseCampaign(
  formData: FormData,
): { ok: true; data: CampaignInput } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim().slice(0, NAME_MAX_CHARS);
  if (!name) return { ok: false, error: "Give this campaign a name." };

  const body = String(formData.get("body") ?? "").trim().slice(0, BODY_MAX_CHARS);
  if (!body) return { ok: false, error: "Write the message that goes out." };

  const channel = asChannel(formData.get("channel"));
  const subject = String(formData.get("subject") ?? "")
    .trim()
    .slice(0, SUBJECT_MAX_CHARS);

  // A text message has no subject line — storing one would put a field on the
  // record that nothing will ever render.
  if (channel === "EMAIL" && !subject) {
    return { ok: false, error: "Email campaigns need a subject line." };
  }

  return {
    ok: true,
    data: {
      name,
      trigger: asTrigger(formData.get("trigger")),
      delayDays: readDelayDays(formData),
      channel,
      subject: channel === "EMAIL" ? subject : null,
      body,
      active: readActive(formData),
    },
  };
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export async function createCampaignAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { shopId } = await requireUser();

  const parsed = parseCampaign(formData);
  if (!parsed.ok) return formError(parsed.error);

  const campaign = await db.campaign.create({
    data: { shopId, ...parsed.data },
    select: { id: true },
  });

  revalidateMarketing(campaign.id);
  redirect(`/marketing/${campaign.id}`);
}

export async function updateCampaignAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { shopId } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const existing = await db.campaign.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  if (!existing) return formError("That campaign no longer exists.");

  const parsed = parseCampaign(formData);
  if (!parsed.ok) return formError(parsed.error);

  await db.campaign.update({ where: { id: existing.id }, data: parsed.data });

  revalidateMarketing(existing.id);
  redirect(`/marketing/${existing.id}`);
}

/**
 * The gallery's Enable button: one click turns a starter template into a live
 * campaign, copy and timing already filled in. It lands active — a template
 * that arrives switched off is a second decision the shop did not ask for.
 */
export async function enableTemplateAction(
  templateId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const { shopId } = await requireUser();

  const template = findTemplate(templateId);
  if (!template) return { ok: false, error: "That template is no longer available." };

  const duplicate = await db.campaign.findFirst({
    where: { shopId, name: template.name },
    select: { id: true },
  });
  if (duplicate) {
    return {
      ok: false,
      error: `You already have a campaign called "${template.name}".`,
    };
  }

  const campaign = await db.campaign.create({
    data: {
      shopId,
      name: template.name,
      trigger: template.trigger,
      delayDays: template.delayDays,
      channel: template.channel,
      subject: template.subject,
      body: template.body,
      active: true,
    },
    select: { id: true, name: true },
  });

  revalidateMarketing(campaign.id);
  return { ok: true, id: campaign.id, name: campaign.name };
}

// ---------------------------------------------------------------------------
// Pause / resume / delete
// ---------------------------------------------------------------------------

export async function setCampaignActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { shopId } = await requireUser();

  const updated = await db.campaign.updateMany({
    where: { id, shopId },
    data: { active },
  });
  if (updated.count === 0) return { ok: false, error: "That campaign no longer exists." };

  revalidateMarketing(id);
  return { ok: true };
}

/**
 * OWNER-only, and a hard delete: the sends cascade with it.
 *
 * Unlike a recurring schedule (whose invoices are financial records that must
 * keep their origin), a campaign's history is marketing chatter. What the
 * customer actually received still exists in their communication log, which
 * lib/comms wrote independently — deleting the campaign does not erase the
 * record of anything that was said to a customer.
 */
export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return;

  const id = String(formData.get("id") ?? "");
  const campaign = await db.campaign.findFirst({
    where: { id, shopId },
    select: { id: true },
  });
  if (!campaign) return;

  await db.campaign.delete({ where: { id: campaign.id } });

  revalidateMarketing();
  redirect("/marketing");
}

// ---------------------------------------------------------------------------
// Engine wrappers
// ---------------------------------------------------------------------------

export type SyncAndSendResult = SyncSummary & RunSummary;

/**
 * The list-page button: queue everything that qualifies, then send whatever is
 * already due. Sync first on purpose — an event that came of age while nobody
 * was looking should go out on the same click, not the next one.
 */
export async function syncAndSendAction(): Promise<SyncAndSendResult> {
  const { shopId } = await requireUser();

  const sync = await syncCampaignSends(shopId);
  const run = await runDueCampaignSends(shopId);

  revalidateMarketing();
  return { ...sync, ...run };
}

/** The detail-page button, scoped to one campaign. */
export async function syncCampaignAction(
  campaignId: string,
): Promise<{ ok: true; result: SyncAndSendResult } | { ok: false; error: string }> {
  const { shopId } = await requireUser();

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, shopId },
    select: { id: true, active: true },
  });
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (!campaign.active) {
    return {
      ok: false,
      error: "This campaign is paused — resume it to queue and send messages.",
    };
  }

  const sync = await syncCampaignSends(shopId, campaign.id);
  const run = await runDueCampaignSends(shopId, campaign.id);

  revalidateMarketing(campaign.id);
  return { ok: true, result: { ...sync, ...run } };
}

/** Used by the pages to label the button; safe to call during a render. */
export async function dueSendCount(campaignId?: string): Promise<number> {
  const { shopId } = await requireUser();
  return countDueSends(shopId, campaignId);
}
