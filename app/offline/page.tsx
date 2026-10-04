import { WifiOff } from "lucide-react";

import { FriendlyScreen } from "@/components/public/friendly-screen";
import { Reconnect } from "./reconnect";

export const metadata = { title: "No internet · Repairs helper" };

/**
 * What the service worker shows when a navigation cannot reach the network.
 *
 * OUTSIDE THE APP SHELL, on purpose: the shell calls `requireUser()`, which
 * needs the database, which is exactly what is unreachable. It is also
 * precached by public/sw.js, so it has to render with nothing: no session, no
 * data, no fetch, and no photo (pictures are not in the offline cache, so the
 * card uses an icon and the precached app icon).
 *
 * Honest about what survives: anything already saved is safe; a form that was
 * never sent is not, and the page says so.
 */
export default function OfflinePage() {
  return (
    <FriendlyScreen
      icon={WifiOff}
      header={
        <div className="mx-auto flex min-h-12 items-center gap-2.5 px-2 text-foreground">
          {/* The one image the service worker precaches with this page. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/symbol-192.png" alt="" className="size-10 rounded-xl" />
          <span className="text-xl tracking-tight">
            <span className="font-medium">Repairs </span>
            <span className="font-bold">helper</span>
          </span>
        </div>
      }
      title="No internet right now"
      body={
        <>
          <p>Your repairs and everything you already saved are safe.</p>
          <p className="mt-2">
            This page will reconnect by itself when the internet comes back. A form you had not sent yet may need filling in again.
          </p>
        </>
      }
    >
      <Reconnect />
    </FriendlyScreen>
  );
}
