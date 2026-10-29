import { appUrl } from "@/lib/comms/config";
import { deliverEmail } from "@/lib/comms/drivers";
import { SUPPORT_EMAIL } from "./config";

/**
 * The three deletion emails. Every one FAILS SOFT: a deletion that has been
 * confirmed must go ahead whether or not the mail server is up, so delivery
 * problems are logged and swallowed, never thrown.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(input: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
}): { text: string; html: string } {
  const footer = `Questions? Email ${SUPPORT_EMAIL}.`;
  const text = [
    input.heading,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    footer,
    "",
    "— Repairs helper",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7ea;border-radius:12px">
    <tr><td style="padding:28px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">Repairs helper</p>
      <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3">${esc(input.heading)}</h1>
      ${input.paragraphs
        .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3f3f46">${esc(p)}</p>`)
        .join("\n      ")}
      ${
        input.button
          ? `<p style="margin:8px 0 22px"><a href="${esc(input.button.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#111214;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${esc(input.button.label)}</a></p>`
          : ""
      }
      <p style="margin:0;padding-top:18px;border-top:1px solid #e7e7ea;font-size:13px;line-height:1.55;color:#6b7280">${esc(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

async function send(to: string | null | undefined, subject: string, body: { text: string; html: string }): Promise<void> {
  if (!to || to.endsWith(".invalid")) return;
  try {
    const status = await deliverEmail({ to, subject, ...body });
    if (status.startsWith("failed:")) console.error(`[account-deletion] email "${subject}" not delivered: ${status}`);
  } catch (error) {
    console.error(`[account-deletion] email "${subject}" threw:`, error instanceof Error ? error.message : error);
  }
}

export async function sendLoginDeletedEmail(input: { to: string; name: string; shopName: string }): Promise<void> {
  await send(
    input.to,
    "Your Repairs helper login was deleted",
    render({
      heading: "Your login was deleted",
      paragraphs: [
        `Hi ${input.name}, your Repairs helper login for ${input.shopName} has been deleted, and you have been signed out everywhere.`,
        "Your name, email address, password, two-step settings and phone notifications were removed. Work you did for the shop (repairs, notes, payments and hours) stays with the shop and now shows as “Deleted user”.",
        `If you did not do this, email ${SUPPORT_EMAIL} straight away.`,
      ],
    }),
  );
}

export async function sendShopDeletionRequestedEmail(input: {
  to: string;
  name: string;
  shopName: string;
  dateLabel: string;
  cancelUrl: string;
}): Promise<void> {
  await send(
    input.to,
    `${input.shopName} is scheduled for deletion`,
    render({
      heading: `${input.shopName} will be deleted on ${input.dateLabel}`,
      paragraphs: [
        `Hi ${input.name}, you asked us to delete ${input.shopName} from Repairs helper. Every login and API key for the shop has been switched off.`,
        `On ${input.dateLabel} the shop's customers, repairs, invoices, payments, stock, staff logins, settings and uploaded files will be permanently deleted. This cannot be undone after that date.`,
        "Changed your mind? Keep your shop with the button below before that date. Everyone's logins come back exactly as they were.",
      ],
      button: { label: "Keep my shop", url: input.cancelUrl },
    }),
  );
}

export async function sendShopDeletionCancelledEmail(input: { to: string; name: string; shopName: string }): Promise<void> {
  await send(
    input.to,
    `${input.shopName} will not be deleted`,
    render({
      heading: "Deletion cancelled",
      paragraphs: [
        `Hi ${input.name}, ${input.shopName} will not be deleted. Logins and API keys that were on before are switched back on.`,
      ],
      button: { label: "Sign in", url: `${appUrl()}/login` },
    }),
  );
}

export async function sendShopDeletedEmail(input: { to: string; name: string; shopName: string }): Promise<void> {
  await send(
    input.to,
    `${input.shopName} has been deleted`,
    render({
      heading: "Your shop has been deleted",
      paragraphs: [
        `Hi ${input.name}, ${input.shopName} and everything in it has now been permanently deleted from Repairs helper: customers, repairs, invoices, payments, stock, staff logins, settings and uploaded files.`,
        "Our database backups are replaced nightly and only the most recent few are kept, so copies in them roll off within a week. Backups are only ever used to recover from a disaster. Thank you for using Repairs helper.",
      ],
    }),
  );
}
