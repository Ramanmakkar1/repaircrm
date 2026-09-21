"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { setSimpleModeAction } from "@/app/(app)/prefs-actions";

/**
 * Turns Simple mode on or off for THIS device and lands on the matching home
 * screen. One control, used from the dashboard's phone/tablet prompt, the
 * counter screen's footer and the user menu.
 */
export function SimpleModeButton({
  on,
  children,
  ...props
}: { on: boolean; children: React.ReactNode } & Omit<ButtonProps, "onClick">) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => start(() => void setSimpleModeAction(on))}
      {...props}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
