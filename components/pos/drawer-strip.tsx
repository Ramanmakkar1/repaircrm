"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { formatCents } from "@/lib/money";
import { DrawerCloseDialog } from "./drawer-close-dialog";
import { DrawerOpenDialog } from "./drawer-open-dialog";
import type { OpenDrawer } from "./drawer-types";

/**
 * The one-line drawer state above the register.
 *
 * One line rather than a panel: the counter's eye belongs on the product grid,
 * and this only has to answer "is the till open, and who opened it" at a
 * glance. It is the first thing on the page because opening the drawer is the
 * first thing that happens in a shift.
 *
 * It is a `Card` with a `tone` stripe rather than the filled accent band it
 * used to be. An open drawer is the NORMAL state of a shop that is trading, and
 * a saturated band on the normal state means the one moment the strip has
 * something urgent to say has nothing louder left to say it with. The state is
 * carried by a `StatusPill` and a 3px edge on a white card, like every other
 * state in the app.
 */
export function DrawerStrip({
  drawer,
  isOwner,
}: {
  /** The open session, or null when the till is closed. */
  drawer: OpenDrawer | null;
  isOwner: boolean;
}) {
  const router = useRouter();

  const refresh = React.useCallback(
    (message: string) => {
      toast.success(message);
      router.refresh();
    },
    [router],
  );

  if (!drawer) {
    return (
      <Card
        tone="neutral"
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
            <ICONS.cash className="size-4 text-muted-foreground" />
          </span>
          {/* Stacked on a phone: side by side these two wrapped mid-phrase. */}
          <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
            <StatusPill size="sm" tone="neutral" label="Drawer closed" />
            <span className="text-[13.5px] text-muted-foreground">
              Open it with the float in the till before taking cash.
            </span>
          </span>
        </span>

        <span className="flex items-center gap-2">
          {isOwner ? <HistoryLink /> : null}
          <DrawerOpenDialog onOpened={() => refresh("Drawer opened.")} />
        </span>
      </Card>
    );
  }

  return (
    <Card
      tone="success"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-resolved-bg">
          <ICONS.cash className="size-4 text-status-resolved-fg" />
        </span>
        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
          <StatusPill size="sm" tone="success" label="Drawer open" />
          <span className="text-[13.5px] text-muted-foreground">
            Since {drawer.openedAtLabel} · {formatCents(drawer.openingCents)}{" "}
            float · {drawer.openedByName}
          </span>
        </span>
      </span>

      <span className="flex items-center gap-2">
        {isOwner ? <HistoryLink /> : null}
        <DrawerCloseDialog
          drawerId={drawer.id}
          onClosed={() => refresh("Drawer closed.")}
        />
      </span>
    </Card>
  );
}

function HistoryLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/pos/drawers">
        <ACTIONS.view className="size-4" />
        Drawer history
      </Link>
    </Button>
  );
}
