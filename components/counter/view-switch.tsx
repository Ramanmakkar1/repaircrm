"use client";

import * as React from "react";
import { LayoutGrid, Loader2, PanelsTopLeft } from "lucide-react";
import { setScreenStyleAction } from "@/app/(app)/counter/screen-style-actions";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

/** The two screen styles, in the words the account menu uses. One name each, everywhere. */
export const SCREEN_STYLES = [
  { value: "easy", title: "Easy", line: "Big boxes, for the counter and phone", icon: LayoutGrid },
  { value: "full", title: "Full", line: "Every list and table, for the back office", icon: PanelsTopLeft },
] as const;

/**
 * Easy or Full, as two clear choices inside the account menu. A device
 * preference only: both styles show the same records and work. The screen
 * redraws where it is (it no longer jumps to another page), and the menu stays
 * open so the person sees what changed.
 */
export function ScreenStyleSwitch({ simple }: { simple: boolean }) {
  const [pending, start] = React.useTransition();
  // Shows the tapped choice at once; the server's answer takes over when it lands.
  const [choice, setChoice] = React.useOptimistic<string>(simple ? "easy" : "full");

  return (
    <div role="presentation">
      <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-2 text-[13px] font-semibold text-muted-foreground">
        Screen style
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={choice}
        onValueChange={(value) => {
          if (value === choice) return;
          start(async () => {
            setChoice(value);
            await setScreenStyleAction(value === "easy");
          });
        }}
      >
        {SCREEN_STYLES.map((style) => (
          <DropdownMenuRadioItem
            key={style.value}
            value={style.value}
            disabled={pending}
            onSelect={(event) => event.preventDefault()}
            className="min-h-14 items-center gap-3 rounded-md py-2 pl-9 pr-2.5"
          >
            <style.icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold leading-tight">{style.title}</span>
              <span className="text-[13px] font-normal leading-snug text-muted-foreground">{style.line}</span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <p className="px-2.5 pb-1.5 pt-1 text-[12.5px] leading-snug text-muted-foreground">Changes this device only, for everyone who uses it.</p>
    </div>
  );
}

/** Kept for older imports: the same switch. */
export const ViewSwitch = ScreenStyleSwitch;
