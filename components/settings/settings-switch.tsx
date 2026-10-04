"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/components/ui/cn";

/**
 * The shared switch, one size up in Easy mode.
 *
 * Same behaviour and props as `components/ui/switch`; only the look differs: a
 * 56x32 track with a 28px knob that a thumb can find on a tablet (Easy mode
 * also gives it a 48px hit area, see globals.css). The knob takes theme colours
 * rather than white so it stays visible on the light track dark mode uses.
 *
 * `words` puts the state beside it in words ("On" / "Off", or the pair you
 * pass, like "Open" / "Closed"), so the state never rests on colour alone. A
 * switch that is locked on (your own account) keeps its full colour: greyed
 * out, an "on" switch reads as "off".
 */
export function Switch({
  className,
  words,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  words?: boolean | readonly [on: string, off: string];
}) {
  const root = (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        "in-data-[touch-workspace=true]:h-8 in-data-[touch-workspace=true]:w-14",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong",
        "disabled:cursor-not-allowed disabled:data-[state=unchecked]:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:bg-accent-foreground",
          "translate-x-0.5 data-[state=checked]:translate-x-[21px]",
          "in-data-[touch-workspace=true]:size-7 in-data-[touch-workspace=true]:data-[state=checked]:translate-x-6",
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!words) return root;
  const [on, off] = words === true ? (["On", "Off"] as const) : words;
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      {root}
      {/* The switch already announces its state; this is the same word for the eye. */}
      <span aria-hidden data-switch-word="" className="min-w-8 text-[15px] font-semibold text-foreground">
        {props.checked ? on : off}
      </span>
    </span>
  );
}
