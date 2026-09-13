import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/comms";
import { db } from "@/lib/db";
import { paymentsLive } from "@/lib/payments";
import { formatBps } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { OnboardingWizard, type WizardData } from "@/components/onboarding/wizard";
import { readOnboarding, resumeStep } from "@/components/onboarding/steps";
import { readPublicHub } from "@/components/settings/hub-meta";

export const metadata = { title: "Set up your shop · RepairPilot" };
export const dynamic = "force-dynamic";

/**
 * /setup — where a brand new shop lands straight after signup.
 *
 * Everything the five cards need is loaded here, on the server, and handed
 * down as plain props. The wizard itself keeps no progress: the resume point
 * comes from `Shop.settings.onboarding`, so closing the tab mid-way and coming
 * back tomorrow reopens the same card.
 *
 * Owner-only. It sets the shop's tax rate and creates staff accounts, which is
 * not a technician's screen even on their first day; the actions behind it
 * re-check the role anyway.
 */
export default async function SetupPage() {
  const session = await requireUser();
  if (session.role !== "OWNER") redirect("/dashboard");

  const [shop, teamCount, productCount, sampleTicket] = await Promise.all([
    db.shop.findUnique({
      where: { id: session.shopId },
      select: {
        name: true,
        slug: true,
        phone: true,
        address1: true,
        city: true,
        state: true,
        postalCode: true,
        taxRateBps: true,
        settings: true,
        stripeAccountId: true,
      },
    }),
    db.user.count({ where: { shopId: session.shopId, active: true } }),
    db.product.count({ where: { shopId: session.shopId } }),
    // Something real to send to the printer. A brand new shop has none, and
    // the card simply leaves that button out rather than offering a 404.
    db.ticket.findFirst({
      where: { shopId: session.shopId },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true },
    }),
  ]);

  if (!shop) redirect("/dashboard");

  const state = readOnboarding(shop.settings);

  const data: WizardData = {
    initialStep: resumeStep(state),
    completed: state.completed ?? [],
    skipped: state.skipped ?? [],
    shop: {
      name: shop.name,
      phone: shop.phone ?? "",
      address1: shop.address1 ?? "",
      city: shop.city ?? "",
      state: shop.state ?? "",
      postalCode: shop.postalCode ?? "",
      // The input is a percentage the way a human writes it; the column is
      // basis points. Zero shows as blank so the field reads as "unanswered"
      // rather than "answered, nil".
      taxRate: shop.taxRateBps > 0 ? formatBps(shop.taxRateBps).replace("%", "") : "",
    },
    teamCount,
    productCount,
    paymentsLive: paymentsLive(),
    stripeConnected: Boolean(shop.stripeAccountId),
    portalUrl: `${appUrl()}/portal`,
    shopUrl: `${appUrl()}/s/${shop.slug}`,
    shopLinkLive: readPublicHub(shop.settings).enabled,
    sampleTicket,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Set up your shop"
        description="Five short steps. Skip anything you'd rather do later — none of it is locked."
      />
      <OnboardingWizard data={data} />
    </div>
  );
}
