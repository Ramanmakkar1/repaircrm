import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignFlow } from "@/components/marketing/campaign-flow";
import { CampaignForm } from "@/components/marketing/campaign-form";
import { readUiPrefs } from "@/lib/prefs";
import { updateCampaignAction } from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;
  const campaign = await db.campaign.findFirst({
    where: { id, shopId },
    select: { name: true },
  });
  return {
    title: campaign
      ? `Edit ${campaign.name} · Repairs helper`
      : "Campaign · Repairs helper",
  };
}

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, { simple }] = await Promise.all([params, readUiPrefs()]);

  const [campaign, shop] = await Promise.all([
    db.campaign.findFirst({ where: { id, shopId } }),
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
  ]);
  if (!campaign) notFound();

  if (simple) {
    // Easy mode: the same steps as a new one, opening on the words; the timing is one tap back.
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <PageHeader
          title={`Edit ${campaign.name}`}
          description="New words go out on every message still waiting."
        />
        <CampaignFlow
          action={updateCampaignAction}
          shopName={shop?.name ?? "Your shop"}
          editing
          initial={{
            id: campaign.id,
            name: campaign.name,
            trigger: campaign.trigger,
            delayDays: campaign.delayDays,
            channel: campaign.channel,
            subject: campaign.subject,
            body: campaign.body,
            active: campaign.active,
          }}
          cancelHref={`/marketing/${campaign.id}`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/marketing/${campaign.id}`}
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ACTIONS.back className="size-4" />
        {campaign.name}
      </Link>

      <PageHeader
        title="Edit campaign"
        description="Reworded copy applies to every message still queued. A change to the wait only affects events queued from here on — already-scheduled dates stay put."
      />

      <CampaignForm
        action={updateCampaignAction}
        shopName={shop?.name ?? "Your shop"}
        initial={{
          id: campaign.id,
          name: campaign.name,
          trigger: campaign.trigger,
          delayDays: campaign.delayDays,
          channel: campaign.channel,
          subject: campaign.subject,
          body: campaign.body,
          active: campaign.active,
        }}
        submitLabel="Save campaign"
        cancelHref={`/marketing/${campaign.id}`}
      />
    </div>
  );
}
