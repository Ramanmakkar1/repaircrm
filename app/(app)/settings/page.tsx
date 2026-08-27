import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { emailDriverName, smsDriverName, appUrl } from "@/lib/comms";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { MessagingConfig } from "@/components/settings/types";
import { problemTypes, ticketStatuses } from "@/components/tickets/ticket-meta";

export const metadata = { title: "Settings · RepairFlow" };

/**
 * Everything a shop can configure, in one place.
 *
 * All the data is loaded here, on the server, and handed to the client tab
 * shell as plain props — including the messaging config, which is read from
 * `process.env` where it belongs. Only *whether* each variable is populated
 * crosses to the browser; never its value.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const isOwner = session.role === "OWNER";

  const [shop, cannedResponses, members, apiKeys] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.shopId },
      select: {
        name: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        timezone: true,
        taxRateBps: true,
        settings: true,
      },
    }),
    db.cannedResponse.findMany({
      where: { shopId: session.shopId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, body: true },
    }),
    // The roster is owner-only; skip the query entirely for everyone else
    // rather than loading colleagues' details and hiding them client-side.
    isOwner
      ? db.user.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Same reasoning as the roster: API keys are owner-only, so a technician's
    // request never loads them at all. No plaintext key exists to load — only
    // the prefix and the hash — but the *existence* of an integration is still
    // the owner's business.
    isOwner
      ? db.apiKey.findMany({
          where: { shopId: session.shopId },
          orderBy: [{ active: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            prefix: true,
            active: true,
            lastUsedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!shop) notFound();

  const messaging: MessagingConfig = {
    emailDriver: emailDriverName(),
    smsDriver: smsDriverName(),
    appUrl: appUrl(),
    emailVars: [
      { name: "RESEND_API_KEY", set: Boolean(process.env.RESEND_API_KEY?.trim()) },
      { name: "EMAIL_FROM", set: Boolean(process.env.EMAIL_FROM?.trim()) },
    ],
    smsVars: [
      {
        name: "TWILIO_ACCOUNT_SID",
        set: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
      },
      {
        name: "TWILIO_AUTH_TOKEN",
        set: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
      },
      { name: "TWILIO_FROM", set: Boolean(process.env.TWILIO_FROM?.trim()) },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Shop details, workflow vocabulary, saved replies and who can sign in."
      />

      <SettingsTabs
        role={session.role}
        currentUserId={session.userId}
        activeTab={typeof params.tab === "string" ? params.tab : ""}
        shop={{
          name: shop.name,
          address1: shop.address1 ?? "",
          address2: shop.address2 ?? "",
          city: shop.city ?? "",
          state: shop.state ?? "",
          postalCode: shop.postalCode ?? "",
          country: shop.country,
          phone: shop.phone ?? "",
          email: shop.email ?? "",
          timezone: shop.timezone,
          taxRateBps: shop.taxRateBps,
        }}
        // The *effective* lists — the shop's own when it has configured them,
        // the built-in defaults otherwise. Editing therefore starts from what
        // the ticket pickers are actually showing today.
        problemTypes={problemTypes(shop.settings)}
        ticketStatuses={ticketStatuses(shop.settings)}
        cannedResponses={cannedResponses}
        members={members.map((member) => ({
          ...member,
          createdAt: member.createdAt.toISOString(),
        }))}
        messaging={messaging}
        apiKeys={apiKeys.map((key) => ({
          ...key,
          lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
          createdAt: key.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
