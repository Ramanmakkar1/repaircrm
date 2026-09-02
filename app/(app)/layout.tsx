import { requireUser } from "@/lib/auth";
import { activeLocations, currentLocationId } from "@/lib/location";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

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
