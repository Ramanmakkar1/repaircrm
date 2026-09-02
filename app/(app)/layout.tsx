import { activeLocations, currentLocationId } from "@/lib/location";
import { requireLiveUser } from "@/lib/session-guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Not just `requireUser()`: this also re-checks, once per request, that the
  // session has not been invalidated by a password change or a deactivation,
  // and that no forced password change is outstanding.
  const user = await requireLiveUser();

  // The branch switcher's data. A single-location shop gets a one-item list,
  // and the topbar renders nothing at all for it.
  const [locations, locationId] = await Promise.all([
    activeLocations(user.shopId),
    currentLocationId(),
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      locations={locations}
      currentLocationId={locationId}
    >
      {children}
    </AppShell>
  );
}
