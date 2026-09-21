"use server";

/**
 * AI assist for the ticket workroom.
 *
 * Both actions are read-only: they generate text and hand it back. Nothing is
 * written to the database, nothing is revalidated, nothing is sent to a
 * customer. A draft lands in the composer textarea for a human to edit and
 * post through the existing `postUpdateAction`; a summary is read once and
 * thrown away. That is the point — AI never gets to be the author of record.
 *
 * Like every action in this folder, the session is re-read here and the ticket
 * is verified to belong to the session's shop BEFORE anything is loaded. An id
 * that arrived over the wire is never trusted.
 */

import { requireUser } from "@/lib/auth";
import { consumeAiQuota } from "@/lib/ai/quota";
import { generate } from "@/lib/ai";
import {
  draftReplyPrompt,
  draftReplySystemPrompt,
  loadTicketContext,
  summarizePrompt,
  SUMMARIZE_SYSTEM_PROMPT,
} from "@/lib/ai/ticket-context";
import { asDraftTone, type AiResult } from "@/lib/ai/types";

/** Generous caps — a reasoning model spends tokens before it starts writing. */
const MAX_TOKENS = 1024;

/**
 * Drafts a customer-facing update from the ticket's own history.
 *
 * Works from either composer mode. A draft written for a private note is still
 * a customer-facing paragraph — front desk pastes it, edits it, then decides
 * whether it goes out. Generating a different register per mode would mean the
 * text changed underneath them when they flipped the switch.
 */
export async function draftTicketReplyAction(
  ticketId: string,
  tone: string,
): Promise<AiResult> {
  const { shopId, name } = await requireUser();

  const ctx = await loadTicketContext(shopId, ticketId);
  if (!ctx) return { ok: false, reason: "Ticket not found." };

  // The signer is whoever is at the keyboard, not the assigned tech: they are
  // the one the customer will reply to.
  const signer = name.trim().split(/\s+/)[0] || "the shop";

  const quota = await consumeAiQuota(shopId, "text");
  if (!quota.ok) return quota;

  return generate({
    system: draftReplySystemPrompt(signer),
    prompt: draftReplyPrompt(ctx, asDraftTone(tone)),
    maxTokens: MAX_TOKENS,
  });
}

/** 3–5 bullets of history, current state and a suggested next action. */
export async function summarizeTicketAction(ticketId: string): Promise<AiResult> {
  const { shopId } = await requireUser();

  const ctx = await loadTicketContext(shopId, ticketId);
  if (!ctx) return { ok: false, reason: "Ticket not found." };

  const quota = await consumeAiQuota(shopId, "text");
  if (!quota.ok) return quota;

  return generate({
    system: SUMMARIZE_SYSTEM_PROMPT,
    prompt: summarizePrompt(ctx),
    maxTokens: MAX_TOKENS,
  });
}
