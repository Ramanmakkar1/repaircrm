import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignForm } from "@/components/marketing/campaign-form";
import { updateCampaignAction } from "../../actions";

export const metadata = { title: "Edit campaign · RepairFlow" };

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [campaign, shop] = await Promise.all([
    db.campaign.findFirst({ where: { id, shopId } }),
    db.shop.findUnique({ where: { id: shopId }, select: { name: true } }),
  ]);
  if (!campaign) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/marketing/${campaign.id}`}
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
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
