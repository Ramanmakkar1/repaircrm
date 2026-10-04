import { readUiPrefs } from "@/lib/prefs";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";

/**
 * Settings opens with a fourteen-query batch plus two live Stripe round trips,
 * so it is the slowest screen in the app to first paint. The grey is drawn in
 * the shell the page lands in — the hub's picture tiles in Easy mode (the
 * default), the side rail in Full mode — so the page replaces it without moving. The layout
 * already reads this same cookie on every request, so reading it here is free.
 */
export default async function SettingsLoading() {
  const { simple } = await readUiPrefs();
  return <SettingsSkeleton simple={simple} />;
}
