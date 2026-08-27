"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  created: "Product created.",
  updated: "Product updated.",
};

/**
 * Fires the one-shot toast a redirecting server action asked for
 * (`?flash=created`) and strips the param so a refresh doesn't repeat it.
 */
export function FlashToast({ flash }: { flash?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current || !flash) return;
    const message = MESSAGES[flash];
    if (!message) return;
    fired.current = true;
    toast.success(message);
    router.replace(pathname, { scroll: false });
  }, [flash, pathname, router]);

  return null;
}
