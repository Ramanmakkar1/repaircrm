import nodemailer from "nodemailer";

/** Hostinger SMTP on the VPS. TLS verification is never disabled. */
export async function deliverSmtp(message: {
  to: string; subject: string; text: string; html: string; from?: string;
}): Promise<string> {
  const host = process.env.SMTP_HOST?.trim();
  const welcome = Boolean(message.from && message.from === process.env.EMAIL_WELCOME_FROM?.trim());
  const user = (welcome ? process.env.SMTP_WELCOME_USER : process.env.SMTP_USER)?.trim();
  const pass = welcome ? process.env.SMTP_WELCOME_PASSWORD : process.env.SMTP_PASSWORD;
  const from = message.from || process.env.EMAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT || 465);
  if (!host || !user || !pass || !from) return "failed: SMTP configuration is incomplete";
  if (port !== 465 && port !== 587) return "failed: SMTP_PORT must be 465 or 587";
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port === 587,
    auth: { user, pass }, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from, to: message.to, subject: message.subject, text: message.text, html: message.html,
      replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined,
    });
    return result.accepted.length ? "sent" : "failed: SMTP recipient was not accepted";
  } catch {
    // SMTP server responses can contain recipient details; do not log them.
    return "failed: SMTP delivery failed; check mailbox configuration";
  } finally { transport.close(); }
}
