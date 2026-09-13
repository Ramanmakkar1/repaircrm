import { WifiOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata = { title: "Offline · RepairPilot" };

/**
 * What the service worker shows when a navigation cannot reach the network.
 *
 * OUTSIDE THE APP SHELL, on purpose: the shell calls `requireUser()`, which
 * needs the database, which is exactly what is unreachable. It is also
 * precached by public/sw.js, so it has to render with nothing — no session, no
 * data, no fetch.
 *
 * The copy says what RepairPilot is rather than apologising: a shop staring at
 * this needs to know their tickets are fine and their connection is not.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 px-8 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-hover text-muted-foreground">
            <WifiOff className="size-6" />
          </span>

          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              You&rsquo;re offline
            </h1>
            <p className="text-[14.5px] leading-relaxed text-muted-foreground">
              RepairPilot needs a connection to show live tickets. Nothing has
              been lost — reconnect and everything will be where you left it.
            </p>
          </div>

          <RetryButton />
        </CardContent>
      </Card>
    </main>
  );
}
