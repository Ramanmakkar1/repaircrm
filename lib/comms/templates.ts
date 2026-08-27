/**
 * Branded message templates.
 *
 * Deliberately tiny: a shop-name header, the message the staff member actually
 * wrote, and a footer pointing back at the customer portal. No layout engine,
 * no MJML — repair-shop notifications are read on a phone in a hallway, and
 * every extra wrapper is one more thing a mail client can mangle.
 *
 * Pure string building: no `db`, no `next/*`, so it is safe to unit-test or
 * import from anywhere on the server.
 */

export type EmailTemplateInput = {
  shopName: string;
  subject: string;
  /** The plain message body, as written by staff. Newlines are preserved. */
  body: string;
  /** Absolute portal URL for the footer link. */
  portalUrl: string;
  /** Optional line under the header, e.g. "Ticket #1042". */
  context?: string | null;
  /**
   * True when `portalUrl` is an invoice page AND card payments are live, so the
   * link is worth describing as a way to pay rather than a way to look. Passed
   * in rather than read from env, because this module stays pure.
   */
  payOnline?: boolean;
};

export type RenderedEmail = { text: string; html: string };

/** Minimal HTML escaping — the body is plain text authored by a human. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail({
  shopName,
  subject,
  body,
  portalUrl,
  context,
  payOnline = false,
}: EmailTemplateInput): RenderedEmail {
  // One link, two labels. The URL is identical either way — a "pay" link that
  // went somewhere other than the invoice page would be the exact shape of a
  // phishing email, and customers are right to be suspicious of those.
  const cta = payOnline ? "Pay this invoice online" : "Open your portal";
  const footLine = payOnline
    ? `Pay online, or view and download the invoice: ${portalUrl}`
    : `View your repairs, estimates and invoices: ${portalUrl}`;

  const text = [
    shopName,
    context ? context : null,
    "",
    body,
    "",
    payOnline ? "Pay online with a card — no account needed." : null,
    payOnline ? "" : null,
    "—",
    footLine,
    `Sent by ${shopName}.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1c1a17;">${esc(
          block,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e2dc;border-radius:16px;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #e6e2dc;">
        <div style="font-size:16px;font-weight:700;color:#1c1a17;">${esc(shopName)}</div>
        ${
          context
            ? `<div style="margin-top:4px;font-size:13px;color:#736c62;">${esc(context)}</div>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 14px;font-size:18px;line-height:1.35;color:#1c1a17;">${esc(subject)}</h1>
        ${paragraphs}
        ${
          payOnline
            ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1c1a17;">You can pay this invoice online with a card — no account needed.</p>`
            : ""
        }
        <p style="margin:22px 0 0;">
          <a href="${esc(portalUrl)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:12px;">${esc(cta)}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;border-top:1px solid #e6e2dc;font-size:12px;color:#736c62;">
        Sent by ${esc(shopName)}. <a href="${esc(portalUrl)}" style="color:#4338ca;">${esc(portalUrl)}</a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

/**
 * SMS is one plain string with a hard length budget — carriers split anything
 * past ~160 chars into billable segments, so the portal link is only appended
 * when there is room for it.
 */
export function renderSms({
  shopName,
  body,
  portalUrl,
}: {
  shopName: string;
  body: string;
  portalUrl: string;
}): string {
  const head = `${shopName}: ${body.replace(/\s+/g, " ").trim()}`;
  const withLink = `${head} ${portalUrl}`;
  if (withLink.length <= 320) return withLink;
  // Trim the message, not the link — the link is the useful half.
  const room = Math.max(40, 320 - portalUrl.length - 2);
  return `${head.slice(0, room).trimEnd()}… ${portalUrl}`;
}
