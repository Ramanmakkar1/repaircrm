import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignFlow } from "@/components/marketing/campaign-flow";
import { CampaignForm } from "@/components/marketing/campaign-form";
import { findTemplate } from "@/components/marketing/meta";
import { readUiPrefs } from "@/lib/prefs";
import { createCampaignAction } from "../actions";

export const metadata = { title: "New campaign · Repairs helper" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const [params, { simple }] = await Promise.all([searchParams, readUiPrefs()]);

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });

  // `?template=` lets the gallery hand a preset over for editing rather than
  // enabling it as-is. Unknown ids simply fall through to a blank form.
  const template =
    typeof params.template === "string" ? findTemplate(params.template) : undefined;

  if (simple) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <PageHeader
          title="New campaign"
          description="A message that goes out on its own after a repair, a payment or a new customer."
        />
        <CampaignFlow
          action={createCampaignAction}
          shopName={shop?.name ?? "Your shop"}
          initial={
            template
              ? {
                  name: template.name,
                  trigger: template.trigger,
                  delayDays: template.delayDays,
                  channel: template.channel,
                  subject: template.subject,
                  body: template.body,
                  active: true,
                }
              : { active: true }
          }
          cancelHref="/marketing"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/marketing"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        All campaigns
      </Link>

      <PageHeader
        title="New campaign"
        description="Pick the moment, the wait, and the words. Nothing sends until you run it."
      />

      <CampaignForm
        action={createCampaignAction}
        shopName={shop?.name ?? "Your shop"}
        initial={{
          name: template?.name,
          trigger: template?.trigger ?? "TICKET_RESOLVED",
          delayDays: template?.delayDays ?? 14,
          channel: template?.channel ?? "EMAIL",
          subject: template?.subject ?? "",
          body: template?.body ?? "",
          active: true,
        }}
        submitLabel="Create campaign"
        cancelHref="/marketing"
      />
    </div>
  );
}
