/** Which Home tab this device last used. A display preference, so it is readable by the client. */
export const HOME_TAB_COOKIE = "rf_home_tab";

export const HOME_TAB_KEYS = ["counter", "stock", "shop"] as const;
export type HomeTabKey = (typeof HOME_TAB_KEYS)[number];

export function asHomeTab(value: string | undefined | null): HomeTabKey | undefined {
  return HOME_TAB_KEYS.find((key) => key === value);
}
