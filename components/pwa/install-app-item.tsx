"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * "Install app" in the user menu — shown ONLY when it will actually work.
 *
 * Chrome and Edge fire `beforeinstallprompt` when a page meets the install
 * criteria (a manifest, a service worker, HTTPS) and the app is not already
 * installed. Holding onto that event is the only way to open the install
 * dialog from a button of our own; there is no API to ask "can I install?".
 *
 * So the item renders nothing until the event has fired. That is the whole
 * design: a permanently visible "Install app" that silently does nothing on
 * Safari, or on a machine where the app is already installed, is worse than no
 * button. Safari users install through Share → Add to Home Screen, which we
 * cannot trigger and do not pretend to.
 *
 * After the prompt is used it cannot be reused, so the item removes itself.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppItem() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);

  React.useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Without this the browser shows its own mini-infobar and our menu item
      // would be a second, competing affordance for the same thing.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }

    function onInstalled() {
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        // Keep the menu open long enough for the browser's own dialog to take
        // over; closing it first can cancel the gesture that authorises it.
        event.preventDefault();
        void prompt.prompt().finally(() => setPrompt(null));
      }}
    >
      <Download className="size-4 text-muted-foreground" />
      Install app
    </DropdownMenuItem>
  );
}
