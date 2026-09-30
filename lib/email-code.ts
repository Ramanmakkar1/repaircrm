import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { authSecretKey } from "@/lib/session";
import { deliverEmail } from "@/lib/comms/drivers";
import { emailDriverName } from "@/lib/comms/config";
import { rateLimit } from "@/lib/rate-limit";

export type EmailCodePurpose = "login" | "reset";
export const CODE_TTL_MS = 10 * 60_000;
export const CODE_ATTEMPTS = 5;

export function hashEmailCode(challenge: string, purpose: EmailCodePurpose, code: string): string {
  return createHmac("sha256", authSecretKey()).update(`${purpose}:${challenge}:${code}`).digest("hex");
}
export function matchesEmailCode(hash: string, challenge: string, purpose: EmailCodePurpose, code: string): boolean {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashEmailCode(challenge, purpose, code), "hex"));
}

/** Identical public result for missing, disabled, throttled and existing users. */
export async function requestEmailCode(email: string, purpose: EmailCodePurpose): Promise<string> {
  const challenge = randomBytes(24).toString("hex");
  if (!rateLimit(`email-code:${email}`, 4, 15 * 60_000).allowed) return challenge;
  if (process.env.NODE_ENV === "production" && emailDriverName() === "log") return challenge;
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active) return challenge;
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const issued = await db.$transaction(async tx => {
    // Lock by address and purpose even when there is no row yet, so resends
    // cannot race and invalidate a code immediately after it was delivered.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext(${email}), hashtext(${purpose}))`;
    const previous = await tx.emailAuthCode.findUnique({ where: { email_purpose: { email, purpose } } });
    if (previous && now.getTime() - previous.lastSentAt.getTime() < 60_000) return false;
    const data = { userId: user.id, email, purpose, challenge, codeHash: hashEmailCode(challenge, purpose, code), attempts: 0, usedAt: null, expiresAt: new Date(now.getTime() + CODE_TTL_MS), lastSentAt: now };
    await tx.emailAuthCode.upsert({ where: { email_purpose: { email, purpose } }, create: data, update: data });
    return true;
  });
  if (!issued) return challenge;
  const label = purpose === "login" ? "sign-in" : "password-reset";
  const text = `Your Repairs helper ${label} code is ${code}. It expires in 10 minutes and can be used once. Never share this code. If you didn’t request it, ignore this email.`;
  const status = await deliverEmail({ to: email, subject: `Your Repairs helper ${label} code`, text,
    html: `<div style="background:#fff;color:#111;font-family:Arial,sans-serif;padding:32px;max-width:520px"><p>Repairs helper</p><h1 style="font-size:24px">Your ${label} code</h1><p style="font-size:36px;letter-spacing:8px;font-weight:700">${code}</p><p>This code expires in 10 minutes and can be used once.</p><p>Never share this code. If you didn’t request it, you can ignore this email.</p></div>` });
  if (status.startsWith("failed:")) {
    await db.emailAuthCode.updateMany({ where: { challenge }, data: { usedAt: new Date() } });
    console.error("[email-code] Delivery failed; challenge invalidated.");
  }
  return challenge;
}

/** Row locking makes the attempt budget and single use hold across processes. */
export async function verifyEmailCode(challenge: string, code: string, purpose: EmailCodePurpose) {
  if (!/^[a-f0-9]{48}$/.test(challenge) || !rateLimit(`code-check:${challenge}`, 10, CODE_TTL_MS).allowed) return null;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "EmailAuthCode" WHERE "challenge" = ${challenge} FOR UPDATE`;
    const row = await tx.emailAuthCode.findUnique({ where: { challenge }, include: { user: true } });
    if (!row || row.purpose !== purpose || row.usedAt || row.attempts >= CODE_ATTEMPTS || row.expiresAt.getTime() <= Date.now()) return null;
    if (!row.user.active || row.email !== row.user.email || (row.user.passwordChangedAt && row.user.passwordChangedAt > row.lastSentAt)) return null;
    const valid = matchesEmailCode(row.codeHash, challenge, purpose, code);
    await tx.emailAuthCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, ...(valid ? { usedAt: new Date() } : {}) } });
    return valid ? row.user : null;
  });
}
