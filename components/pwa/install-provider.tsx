"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInstructionsGate } from "./install-gate";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const InstallContext = React.createContext<{
  installed: boolean;
  install: () => void;
  /** For the account menu's `onCloseAutoFocus`: the how-to dialog opens once the menu is gone. */
  menuClosed: (event: Event) => void;
} | null>(null);

/** Capture installation events at shell mount, before the account menu opens. */
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [instructions, setInstructions] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const gate = React.useMemo(() => createInstructionsGate(() => setInstructions(true)), []);
  React.useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setPrompt(null); setInstalled(true); setInstructions(false); };
    update();
    standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (pending || installed) return;
    // Only the account menu calls this, and it is still closing: the dialog waits for it.
    if (!prompt) { gate.request(); return; }
    setPending(true);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setInstructions(true); }
    finally { setPrompt(null); setPending(false); }
  }

  return <InstallContext.Provider value={{ installed, install: () => { void install(); }, menuClosed: gate.menuClosed }}>
    {children}
    <Dialog open={instructions} onOpenChange={setInstructions}>
      <DialogContent>
        <DialogHeader><DialogTitle>Install Repairs helper</DialogTitle><DialogDescription>Open your shop from an app icon in its own window.</DialogDescription></DialogHeader>
        <div className="space-y-4 text-sm">
          <p><strong>iPhone or iPad:</strong> open this shop in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered.</p>
          <p><strong>Android:</strong> open this shop in Chrome, open the browser menu and choose Install app or Add to Home screen.</p>
          <p><strong>Computer:</strong> in Chrome or Edge, use the install icon in the address bar or the browser menu&apos;s app-install option.</p>
          <p className="text-muted-foreground">A connection is needed for live repairs, stock and payments.</p>
        </div>
        <Button className="min-h-12" onClick={() => setInstructions(false)}>Done</Button>
      </DialogContent>
    </Dialog>
  </InstallContext.Provider>;
}

export function useAppInstall() {
  return React.useContext(InstallContext);
}
