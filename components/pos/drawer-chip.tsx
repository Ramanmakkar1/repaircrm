"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { TONE_CLASS } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACTIONS } from "@/components/ui/icons";
import { DrawerCloseDialog } from "./drawer-close-dialog";
import { DrawerOpenDialog } from "./drawer-open-dialog";
import type { OpenDrawer } from "./drawer-types";
import { drawerChipInfo } from "./terminal-logic";

const ITEM = "min-h-12 px-3 text-[15px]";

/**
 * The drawer, as one small chip in the register's toolbar.
 *
 * It says the state in words with a dot ("Drawer open" / "Drawer closed") and
 * opens a short menu with the same actions the full strip has: open or close
 * the drawer, and (for the owner) the drawer history. The two dialogs live
 * beside the menu, not inside it, so they stay mounted after the menu closes.
 */
export function DrawerChip({
  drawer,
  isOwner,
}: {
  /** The open session, or null when the till is closed. */
  drawer: OpenDrawer | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"open" | "close" | null>(null);
  const info = drawerChipInfo(drawer);
  const chipRef = React.useRef<HTMLButtonElement>(null);

  const refresh = React.useCallback(
    (message: string) => {
      toast.success(message);
      router.refresh();
    },
    [router],
  );
  // The dialogs have no trigger of their own, so when one closes focus would
  // fall to the page; put it back on the chip.
  const setOpenDialog = React.useCallback((next: boolean) => {
    setDialog(next ? "open" : null);
    if (!next) requestAnimationFrame(() => chipRef.current?.focus());
  }, []);
  const setCloseDialog = React.useCallback((next: boolean) => {
    setDialog(next ? "close" : null);
    if (!next) requestAnimationFrame(() => chipRef.current?.focus());
  }, []);

  return (
    <>
      {/* Not modal: a modal menu and the dialog it opens fight over the page's
          pointer events, and the page can be left unclickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            ref={chipRef}
            type="button"
            aria-label={`${info.label}. Drawer actions`}
            className={cn(
              "inline-flex h-12 items-center gap-2 rounded-xl border border-border-strong bg-surface px-3.5 text-[14px] font-semibold text-foreground",
              "transition-colors hover:bg-surface-hover data-[state=open]:bg-surface-hover",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span
              aria-hidden
              className={cn("size-2.5 shrink-0 rounded-full", TONE_CLASS[info.tone].dot)}
            />
            <span className="whitespace-nowrap">{info.label}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-2">
          <DropdownMenuLabel className="whitespace-normal px-3 py-2 text-[13px] font-normal leading-snug">
            {info.detail}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {drawer ? (
            <DropdownMenuItem className={ITEM} onSelect={() => setDialog("close")}>
              <ACTIONS.close className="size-5" aria-hidden />
              Close drawer
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={ITEM} onSelect={() => setDialog("open")}>
              <ACTIONS.open className="size-5" aria-hidden />
              Open drawer
            </DropdownMenuItem>
          )}
          {isOwner ? (
            <DropdownMenuItem asChild className={ITEM}>
              <Link href="/pos/drawers">
                <ACTIONS.view className="size-5" aria-hidden />
                Drawer history
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DrawerOpenDialog
        open={dialog === "open"}
        onOpenChange={setOpenDialog}
        onOpened={() => refresh("Drawer opened.")}
      />
      {drawer ? (
        <DrawerCloseDialog
          drawerId={drawer.id}
          open={dialog === "close"}
          onOpenChange={setCloseDialog}
          onClosed={() => refresh("Drawer closed.")}
        />
      ) : null}
    </>
  );
}
