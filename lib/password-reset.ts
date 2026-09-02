import crypto from "node:crypto";

import { appUrl } from "@/lib/comms/config";
import { deliverEmail } from "@/lib/comms/drivers";
import { db } from "@/lib/db";

/**
 * Password reset and invite links.
 *
 * STAFF MAIL, NOT CUSTOMER MAIL. These go through the email driver directly and
 * deliberately do NOT write a `CommunicationLog` row: the outbox is a
 * customer's communication history, and "we emailed the owner a reset link"
 * belongs in the audit log, not in a customer's timeline.
 *
 * The token in the link is 32 random bytes, hex-encoded. Only its sha256 is
 * stored, so a database dump does not hand over working links — the same
 * bargain lib/api-key.ts makes with API keys.
 */

/** A forgotten password is being reset right now; an hour is generous. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** An invite waits for a new hire to check their mail — three days. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function resetUrl(token: string): string {
  return `${appUrl()}/reset-password/${token}`;
}

export type IssuedResetToken = {
  token: string;
  url: string;
  expiresAt: Date;
};

/**
 * Mints a reset token for a user, invalidating any earlier unused ones.
 *
 * Invalidating first is the point: two live links means an old email forwarded
 * to the wrong person still opens the door after the real owner has used theirs.
 */
export async function issueResetToken(
  userId: string,
  ttlMs: number = RESET_TTL_MS,
): Promise<IssuedResetToken> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash: hashResetToken(token), expiresAt },
    }),
  ]);

  return { token, url: resetUrl(token), expiresAt };
}

export type ResolvedResetToken = {
  tokenId: string;
  userId: string;
  email: string;
  name: string;
  shopId: string;
};

/**
 * Looks a token up and reports whether it is still good: it must exist, be
 * unused, be unexpired, and belong to an account that can still sign in.
 */
export async function resolveResetToken(
  token: string,
): Promise<ResolvedResetToken | null> {
  if (typeof token !== "string" || token.length < 32) return null;

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: {
        select: { id: true, email: true, name: true, shopId: true, active: true },
      },
    },
  });

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (!row.user.active) return null;

  return {
    tokenId: row.id,
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    shopId: row.user.shopId,
  };
}

// ---------------------------------------------------------------------------
// The two emails
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A plain staff notice: one heading, one sentence, one button, the raw URL
 * underneath for the mail clients that eat buttons. No shop branding — this is
 * about the RepairFlow account, not about the shop's customers.
 */
function staffEmail(input: {
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  footer: string;
}): { text: string; html: string } {
  const text = [
    input.heading,
    "",
    input.intro,
    "",
    input.url,
    "",
    input.footer,
    "",
    "— RepairFlow",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7ea;border-radius:12px">
    <tr><td style="padding:28px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">RepairFlow</p>
      <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3">${esc(input.heading)}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#3f3f46">${esc(input.intro)}</p>
      <p style="margin:0 0 22px">
        <a href="${esc(input.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${esc(input.buttonLabel)}</a>
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Or paste this into your browser:</p>
      <p style="margin:0 0 22px;font-size:13px;word-break:break-all"><a href="${esc(input.url)}" style="color:#4f46e5">${esc(input.url)}</a></p>
      <p style="margin:0;padding-top:18px;border-top:1px solid #e7e7ea;font-size:13px;line-height:1.55;color:#6b7280">${esc(input.footer)}</p>
    </td></tr>
  </table>
</body></html>`;

  return { text, html };
}

/** Returns the driver status string ("logged" | "sent" | "failed: …"). */
export async function sendResetEmail(input: {
  to: string;
  name: string;
  url: string;
}): Promise<string> {
  const body = staffEmail({
    heading: "Reset your password",
    intro: `Hi ${input.name} — use the link below to choose a new RepairFlow password. It stops working in one hour.`,
    buttonLabel: "Choose a new password",
    url: input.url,
    footer:
      "If you didn't ask for this, you can ignore this email — your password has not changed.",
  });

  return deliverEmail({
    to: input.to,
    subject: "Reset your RepairFlow password",
    text: body.text,
    html: body.html,
  });
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  shopName: string;
  url: string;
}): Promise<string> {
  const body = staffEmail({
    heading: `You've been invited to ${input.shopName}`,
    intro: `Hi ${input.name} — your RepairFlow account is ready. Set a password to sign in. This link works for three days.`,
    buttonLabel: "Set your password",
    url: input.url,
    footer:
      "If the link has expired, ask the shop owner to resend your invite from Settings → Team.",
  });

  return deliverEmail({
    to: input.to,
    subject: `Set your password for ${input.shopName} · RepairFlow`,
    text: body.text,
    html: body.html,
  });
}
