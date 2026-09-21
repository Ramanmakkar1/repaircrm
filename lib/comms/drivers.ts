/**
 * Provider drivers.
 *
 * Each driver takes a fully-rendered message and answers with the string that
 * lands in `CommunicationLog.status`:
 *
 *   "logged"          the log driver wrote it to the console (nothing was sent)
 *   "sent"            the provider accepted it
 *   "failed: reason"  the provider rejected it, or the network did
 *
 * Drivers never throw: a mail provider having a bad afternoon must not roll back
 * a ticket update. The failure is recorded on the outbox row instead, which is
 * exactly where staff go looking when a customer says "I never got that".
 *
 * No SDKs — both providers are one plain `fetch` against a documented REST
 * endpoint, so there is nothing to keep in sync with a dependency tree.
 */

import { emailDriverName, smsDriverName } from "./config";

/** Requests are abandoned rather than allowed to hang a Server Action. */
const TIMEOUT_MS = 10_000;

function failure(reason: unknown): string {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "unknown error";
  // The status column is for humans skimming a list — keep it to one line.
  return `failed: ${message.replace(/\s+/g, " ").trim().slice(0, 180)}`;
}

function logBlock(kind: "EMAIL" | "SMS", lines: string[], body: string): void {
  const rule = "─".repeat(64);
  console.log(
    [
      `\n┌${rule}`,
      `│ ${kind} · log driver · nothing was actually sent`,
      `├${rule}`,
      ...lines.map((line) => `│ ${line}`),
      `├${rule}`,
      ...body.split("\n").map((line) => `│ ${line}`),
      `└${rule}\n`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export async function deliverEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<string> {
  if (emailDriverName() === "log") {
    logBlock("EMAIL", [`to:      ${message.to}`, `subject: ${message.subject}`], message.text);
    return "logged";
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey) return "failed: RESEND_API_KEY is not set";
  if (!from) return "failed: EMAIL_FROM is not set";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return failure(`resend ${response.status} ${detail}`);
    }
    return "sent";
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

export async function deliverSms(message: {
  to: string;
  body: string;
}): Promise<string> {
  if (smsDriverName() === "log") {
    logBlock("SMS", [`to: ${message.to}`], message.body);
    return "logged";
  }

  if (smsDriverName() === "android_gateway") return deliverViaAndroidGateway(message);

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  if (!sid) return "failed: TWILIO_ACCOUNT_SID is not set";
  if (!token) return "failed: TWILIO_AUTH_TOKEN is not set";
  if (!from) return "failed: TWILIO_FROM is not set";

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: message.to,
          From: from,
          Body: message.body,
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return failure(`twilio ${response.status} ${detail}`);
    }
    return "sent";
  } catch (error) {
    return failure(error);
  }
}

/**
 * SMS Gateway for Android — the shop's own phone does the sending.
 *
 * `SMS_GATEWAY_URL` is the whole message endpoint, not a base, because the app
 * has three modes with three addresses and the app's own screen prints the right
 * one: its cloud relay, a self-hosted private server, or the phone itself on the
 * shop's network (`http://<phone-ip>:8080/message` — which a cloud-hosted
 * RepairPilot cannot reach, so use the cloud or private mode there).
 *
 * The gateway answers 202: the message is QUEUED on the phone, not delivered.
 * "sent" here therefore means what it means for Twilio — accepted for delivery.
 */
async function deliverViaAndroidGateway(message: { to: string; body: string }): Promise<string> {
  const url = process.env.SMS_GATEWAY_URL?.trim();
  const user = process.env.SMS_GATEWAY_USER?.trim();
  const password = process.env.SMS_GATEWAY_PASSWORD?.trim();
  if (!url) return "failed: SMS_GATEWAY_URL is not set";
  if (!user) return "failed: SMS_GATEWAY_USER is not set";
  if (!password) return "failed: SMS_GATEWAY_PASSWORD is not set";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        textMessage: { text: message.body },
        phoneNumbers: [message.to],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return failure(`sms gateway ${response.status} ${detail}`);
    }
    return "sent";
  } catch (error) {
    return failure(error);
  }
}
