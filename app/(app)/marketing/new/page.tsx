import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIONS } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignForm } from "@/components/marketing/campaign-form";
import { findTemplate } from "@/components/marketing/meta";
import { createCampaignAction } from "../actions";

export const metadata = { title: "New campaign · RepairFlow" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { shopId } = await requireUser();
  const params = await searchParams;

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { name: true },
  });

  // `?template=` lets the gallery hand a preset over for editing rather than
  // enabling it as-is. Unknown ids simply fall through to a blank form.
  const template =
    typeof params.template === "string" ? findTemplate(params.template) : undefined;

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
