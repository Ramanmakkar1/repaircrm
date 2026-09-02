"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { DrawerCloseDialog } from "./drawer-close-dialog";
import { DrawerOpenDialog } from "./drawer-open-dialog";
import type { OpenDrawer } from "./drawer-types";

/**
 * The one-line drawer state above the register.
 *
 * A strip rather than a card: the counter's eye belongs on the product grid,
 * and this only has to answer "is the till open, and who opened it" at a
 * glance. It is the first thing on the page because opening the drawer is the
 * first thing that happens in a shift.
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-3.5 shadow-sm">
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-surface-hover">
            <Banknote className="size-4 text-muted-foreground" />
          </span>
          <span className="text-[14.5px] font-semibold text-foreground">
            Drawer closed
          </span>
          <span className="text-[13.5px] text-muted-foreground">
            Open it with the float in the till before taking cash.
          </span>
        </span>

        <span className="flex items-center gap-2">
          {isOwner ? <HistoryLink /> : null}
          <DrawerOpenDialog onOpened={() => refresh("Drawer open.")} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft px-5 py-3.5 shadow-sm">
      <span className="flex flex-wrap items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface">
          <Banknote className="size-4 text-accent" />
        </span>
        <span className="text-[14.5px] font-semibold text-accent-soft-foreground">
          Drawer open since{" "}
          {new Date(drawer.openedAtISO).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="text-[13.5px] text-accent-soft-foreground/80">
          {formatCents(drawer.openingCents)} float · {drawer.openedByName}
        </span>
      </span>

      <span className="flex items-center gap-2">
        {isOwner ? <HistoryLink /> : null}
        <DrawerCloseDialog
          drawerId={drawer.id}
          onClosed={() => refresh("Drawer closed.")}
        />
      </span>
    </div>
  );
}

function HistoryLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/pos/drawers">
        <History className="size-4" />
        History
      </Link>
    </Button>
  );
}
