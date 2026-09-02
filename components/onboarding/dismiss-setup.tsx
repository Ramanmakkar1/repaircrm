"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { dismissSetupChecklistAction } from "@/app/(app)/setup/actions";
import { Button } from "@/components/ui/button";

/**
 * The dashboard checklist's dismiss control.
 *
 * A separate client island so the card itself stays a Server Component and can
 * do its own scoped counting without shipping any of it to the browser.
 */
export function DismissSetup() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function dismiss() {
    setBusy(true);
    const result = await dismissSetupChecklistAction();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={dismiss}
      disabled={busy}
      aria-label="Hide the setup checklist"
      title="Hide this — everything stays in Settings"
    >
      <X />
    </Button>
  );
}
