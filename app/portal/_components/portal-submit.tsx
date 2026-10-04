"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { HUGE_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * The portal's big submit button: the shared Button at the public 56px size.
 * A form in flight disables its button and says so, so a second impatient tap
 * cannot mail a second sign-in link.
 */
export function PortalSubmit({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className={cn(HUGE_BUTTON, className)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}
