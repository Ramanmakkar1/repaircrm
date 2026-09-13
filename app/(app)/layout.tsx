import { activeLocations, currentLocationId } from "@/lib/location";
import { readUiPrefs } from "@/lib/prefs";
import { requireLiveUser } from "@/lib/session-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { platformSetting } from "@/lib/platform-admin";
import { isPlatformAdminEmail } from "@/lib/platform-admin-access";

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
  // Display preferences come off the request cookie, so the shell renders at
  // the right density and the rail at the right width on the FIRST byte — no
  // hydrate-then-snap.
  const [locations, locationId, prefs] = await Promise.all([
    activeLocations(user.shopId),
    currentLocationId(),
    readUiPrefs(),
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      showPlatformAdmin={isPlatformAdminEmail(
        user.email,
        platformSetting("PLATFORM_ADMIN_EMAILS"),
      )}
      locations={locations}
      currentLocationId={locationId}
      prefs={prefs}
    >
      {/* Production only; see the note in the component. */}
      <RegisterServiceWorker />
      {children}
    </AppShell>
  );
}
