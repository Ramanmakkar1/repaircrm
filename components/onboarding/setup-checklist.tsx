import Link from "next/link";
// Rocket is the checklist's own mark; Check is the tick on a done row.
import { Check, Rocket } from "lucide-react";

import { getSession } from "@/lib/auth";
import { emailDriverName } from "@/lib/comms";
import { db } from "@/lib/db";
import { stripeSecretKey } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { Card, CardContent } from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { DismissSetup } from "./dismiss-setup";
import { readPublicHub } from "@/components/settings/hub-meta";
import { readOnboarding } from "./steps";

/**
 * "Set up your shop" — the dashboard's first card, until it isn't.
 *
 * Every row is computed from REAL DATA, not from what the wizard remembers
 * being told: a shop that skipped the tax step but set a rate in Settings ten
 * minutes later gets a tick, and one that pressed "Save and continue" on an
 * empty form does not. The wizard's own progress only controls whether this
 * card has been dismissed.
 *
 * It renders nothing at all once every row is done, or once an owner has
 * dismissed it — a permanent checklist with six ticks on it is decoration.
 *
 * Owner-only: four of the six rows lead to owner-only screens, and a card that
 * nags a technician about things they cannot change is just noise on the one
 * page they look at all day.
 */
export async function SetupChecklist() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") return null;

  const shopId = session.shopId;

  const [shop, productCount, customerCount, teamCount] = await Promise.all([
    db.shop.findUnique({
      where: { id: shopId },
      select: { taxRateBps: true, settings: true, stripeAccountId: true },
    }),
    db.product.count({ where: { shopId } }),
    db.customer.count({ where: { shopId } }),
    db.user.count({ where: { shopId, active: true } }),
  ]);

  if (!shop) return null;
  if (readOnboarding(shop.settings).dismissed) return null;

  const rows = [
    {
      // First, because it is the one row that brings work IN rather than
      // tidying work that has already arrived.
      label: "Share your shop link",
      hint: "Put this on your website and your Google listing — customers book, check a repair and pay from it.",
      done: readPublicHub(shop.settings).enabled,
      href: "/settings?tab=connect",
      cta: "Get my link",
    },
    {
      label: "Set your sales tax rate",
      hint: "So invoices total correctly from the first one.",
      done: shop.taxRateBps > 0,
      href: "/settings?tab=shop",
      cta: "Shop settings",
    },
    {
      label: "Add a product or service",
      hint: "Your common jobs become one-tap lines on tickets and invoices.",
      done: productCount > 0,
      href: "/inventory/new",
      cta: "Add an item",
    },
    {
      label: "Add your first customer",
      hint: "Or let one arrive with a ticket — either way works.",
      done: customerCount > 0,
      href: "/customers/new",
      cta: "Add a customer",
    },
    {
      label: "Invite someone from your team",
      hint: "Technicians get their own queue; front desk gets intake and billing.",
      done: teamCount > 1,
      href: "/settings?tab=team",
      cta: "Team settings",
    },
    {
      label: "Turn on online payments",
      hint: "Emailed invoices get a Pay button and mark themselves paid.",
      // Either half is enough to call this done: the shop's own connected
      // Stripe account, or a server-wide key on a single-tenant install.
      done: Boolean(shop.stripeAccountId) || Boolean(stripeSecretKey()),
      href: "/settings?tab=payments",
      cta: "Payment settings",
    },
    {
      label: "Set up email sending",
      hint: "Until then, messages are printed to the server log instead of sent.",
      done: emailDriverName() !== "log",
      href: "/settings?tab=messaging",
      cta: "Messaging settings",
    },
  ];

  const outstanding = rows.filter((row) => !row.done);
  if (outstanding.length === 0) return null;

  const done = rows.length - outstanding.length;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <IconChip icon={Rocket} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Set up your shop
            </h3>
            <p className="text-[13.5px] text-muted-foreground">
              {done} of {rows.length} done — {outstanding.length} left, none of
              them long.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" asChild>
            <Link href="/setup">
              Open the guide <ACTIONS.next />
            </Link>
          </Button>
          <DismissSetup />
        </div>
      </div>

      <CardContent className="px-0 py-0">
        <details>
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Show setup checklist</summary>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    row.done
                      ? "border-status-resolved bg-status-resolved-bg text-status-resolved-fg"
                      : "border-border-strong bg-surface",
                  )}
                >
                  {row.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-[14.5px] font-semibold",
                      row.done
                        ? "text-muted-foreground line-through"
                        : "text-foreground",
                    )}
                  >
                    {row.label}
                  </span>
                  {!row.done ? (
                    <span className="text-[13px] text-muted-foreground">
                      {row.hint}
                    </span>
                  ) : null}
                </div>
              </div>
              {!row.done ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={row.href}>
                    {row.cta} <ACTIONS.next />
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        </details>
      </CardContent>
    </Card>
  );
}
