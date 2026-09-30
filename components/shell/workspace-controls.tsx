"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Home, Search } from "lucide-react";
import type { UiPrefs } from "@/lib/prefs";
import { workspaceBack } from "@/lib/touch-workspace";
import { Button } from "@/components/ui/button";
import { ViewSwitch } from "@/components/counter/view-switch";
import { LocationSwitcher, type SwitcherLocation } from "./location-switcher";
import { UserMenu, type CurrentUser } from "./user-menu";

/** Page controls live inside the workspace; there is no website masthead or footer. */
export function WorkspaceControls({ user, locations, currentLocationId, prefs, onSearch }: {
  user: CurrentUser; locations: SwitcherLocation[]; currentLocationId: string; prefs: UiPrefs; onSearch: () => void;
}) {
  const path = usePathname();
  const home = path === "/counter";
  const guidedEntry = prefs.simple && (path === "/tickets/new" || path === "/invoices/new");
  return (
    <nav aria-label="Workspace controls" className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {!home ? <>
          {!guidedEntry ? <Button variant="outline" asChild className="min-h-12 px-4"><Link href={workspaceBack(path)}><ArrowLeft aria-hidden />Back</Link></Button> : null}
          <Button variant="ghost" asChild className="min-h-12 px-4"><Link href="/counter"><Home aria-hidden />Home</Link></Button>
        </> : <ViewSwitch simple={prefs.simple} />}
      </div>
      <div className="flex items-center gap-2">
        {locations.length > 1 ? <LocationSwitcher locations={locations} currentId={currentLocationId} /> : null}
        <Button variant="outline" onClick={onSearch} className="min-h-12 px-4" aria-label="Search your shop"><Search aria-hidden /><span className="hidden sm:inline">Search</span></Button>
        <UserMenu user={user} density={prefs.density} theme={prefs.theme} simple={prefs.simple} />
      </div>
    </nav>
  );
}
