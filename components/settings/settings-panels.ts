import {
  ClipboardCheck,
  CreditCard,
  KeyRound,
  Link2,
  ListChecks,
  type LucideIcon,
  Mail,
  MapPin,
  MessageSquareText,
  Plug,
  ScrollText,
  Store,
  Timer,
  CircleUser,
  Users,
} from "lucide-react";

/**
 * The sections of Settings, and who sees which. Pure data and a few pure
 * helpers, kept out of the client component so they can be tested on their own.
 */
export interface SettingsPanel {
  /** Mirrored into `?tab=` — never rename one of these, links depend on them. */
  value: string;
  label: string;
  /** The one line under the panel title. Says what this screen is *for*. */
  blurb: string;
  group: string;
  icon: LucideIcon;
  /** The tile picture on the Settings hub (Easy mode), from /public/images. */
  photo: string;
}

export interface SettingsGroup {
  /** Empty when the panels are too few to deserve headings. */
  label: string;
  items: SettingsPanel[];
}

const HOME = "/images/home";
const PRODUCTS = "/images/products";

/**
 * Owner settings, grouped the way a shop owner thinks about them rather than
 * the order the features happened to be built in. Fourteen flat tabs wrapped
 * onto a second row on a laptop and read as one undifferentiated wall; five
 * short groups do not.
 *
 * Order within a group is deliberate: the thing you configure first comes first.
 * Names are the words a shop owner uses: "Saved replies", not "Canned
 * responses"; "Accounting", not "Integrations"; "Activity history", not
 * "Audit log".
 */
export const OWNER_PANELS: SettingsPanel[] = [
  {
    value: "shop",
    label: "Shop details",
    blurb: "Your shop's name, address, time zone, sales tax and labour rate.",
    group: "Shop",
    icon: Store,
    photo: `${HOME}/cash-register.webp`,
  },
  {
    value: "workflow",
    label: "Devices & repair steps",
    blurb:
      "The devices and problems staff tap on a new repair, the steps a repair goes through, how long each may take, and checklists.",
    group: "Shop",
    icon: ListChecks,
    photo: `${PRODUCTS}/repair-tools.webp`,
  },
  {
    value: "locations",
    label: "Locations",
    blurb: "The branches you work out of, and which one each person starts in.",
    group: "Shop",
    icon: MapPin,
    photo: `${HOME}/delivery-van.webp`,
  },
  {
    value: "canned",
    label: "Saved replies",
    blurb: "Messages your team sends often, ready to drop into a customer update.",
    group: "Shop",
    icon: MessageSquareText,
    photo: `${PRODUCTS}/phone.webp`,
  },
  {
    value: "team",
    label: "Team",
    blurb: "Who can sign in, and what each person can do.",
    group: "People",
    icon: Users,
    photo: `${HOME}/customers-cards.webp`,
  },
  {
    value: "profile",
    label: "My profile",
    blurb: "Your own name, your password and your two-step sign-in.",
    group: "People",
    icon: CircleUser,
    photo: `${HOME}/time-clock.webp`,
  },
  {
    value: "payments",
    label: "Getting paid",
    blurb: "Card payments, the card machine at the counter, and how customers pay an invoice.",
    group: "Money",
    icon: CreditCard,
    photo: `${HOME}/card-terminal.webp`,
  },
  {
    // The front door: one screen an owner can work top to bottom. It leads the
    // group because "how do I connect this to my website?" is the first
    // question a new shop asks, and every row below it links to the tab that
    // actually owns that setting.
    value: "connect",
    label: "Shop link",
    blurb:
      "Your one link for customers, as a QR code and a sign, and everything else you can connect.",
    group: "Connections",
    icon: Link2,
    photo: `${HOME}/display-screen.webp`,
  },
  {
    value: "messaging",
    label: "Emails & texts",
    blurb: "Whether your emails and text messages reach customers, and where their replies go.",
    group: "Connections",
    icon: Mail,
    photo: `${HOME}/megaphone.webp`,
  },
  {
    value: "checkin",
    label: "Check-in & reviews",
    blurb: "The page customers book their own device in on, and the review request after pickup.",
    group: "Connections",
    icon: ClipboardCheck,
    photo: `${PRODUCTS}/tablet.webp`,
  },
  {
    value: "integrations",
    label: "Accounting",
    blurb:
      "Send your invoices and payments to QuickBooks or Xero, so nobody types them twice.",
    group: "Connections",
    icon: Plug,
    photo: `${HOME}/invoice-pad.webp`,
  },
  {
    // Webhooks live on this panel too, and nobody found them under "API keys".
    value: "api-keys",
    label: "Developer access",
    blurb: "Only if another program needs to connect to your shop. For your web developer.",
    group: "Connections",
    icon: KeyRound,
    photo: `${PRODUCTS}/laptop.webp`,
  },
  {
    value: "automation",
    label: "Reminders & follow-ups",
    blurb: "The things Repairs helper does by itself: repeat invoices, review requests, marketing sends.",
    group: "System",
    icon: Timer,
    photo: `${HOME}/gears.webp`,
  },
  {
    value: "audit",
    label: "Activity history",
    blurb: "Who changed what in this shop, and when, day by day.",
    group: "System",
    icon: ScrollText,
    photo: `${HOME}/diary.webp`,
  },
];

/**
 * Everyone who is not an owner. My profile leads, because a technician opening
 * Settings is nearly always here to change their own password.
 */
export const STAFF_PANELS: SettingsPanel[] = ["profile", "canned", "messaging"].map(
  (value) => OWNER_PANELS.find((panel) => panel.value === value)!,
);

export const GROUP_ORDER = ["Shop", "People", "Money", "Connections", "System"];

export function panelsForRole(role: string): SettingsPanel[] {
  return role === "OWNER" ? OWNER_PANELS : STAFF_PANELS;
}

/** Three links do not need five headings over them; fourteen do. */
export function hasGroupLabels(panels: SettingsPanel[]): boolean {
  return panels.length > 5;
}

export function groupPanels(panels: SettingsPanel[]): SettingsGroup[] {
  if (!hasGroupLabels(panels)) return [{ label: "", items: panels }];
  return GROUP_ORDER.map((label) => ({
    label,
    items: panels.filter((panel) => panel.group === label),
  })).filter((group) => group.items.length > 0);
}

/** `?tab=` is untrusted: anything that is not a panel this role has falls back to the first. */
export function resolvePanel(panels: SettingsPanel[], tab: string): string {
  return panels.some((panel) => panel.value === tab) ? tab : panels[0].value;
}

/**
 * Easy mode opens on the hub: a `?tab=` naming a panel this role has opens that
 * panel; nothing (or anything else) is the hub, so a bad link lands somewhere
 * useful instead of on a random first panel.
 */
export function resolveHubPanel(panels: SettingsPanel[], tab: string | null | undefined): string | null {
  return tab && panels.some((panel) => panel.value === tab) ? tab : null;
}

/** The group a panel sits in; the first group when the value is unknown. */
export function groupOf(groups: SettingsGroup[], value: string): SettingsGroup {
  return (
    groups.find((group) => group.items.some((panel) => panel.value === value)) ??
    groups[0]
  );
}

const BASE = "http://settings.invalid";

/**
 * The panel a link such as `/settings?tab=payments` points at, or null when
 * the link goes anywhere else (another page, a link with extra parameters like
 * `?tab=integrations&connected=xero` that needs a real navigation, an external
 * address). Only plain same-page tab links are taken over by the client.
 */
export function tabFromHref(
  href: string | null | undefined,
  pathname: string,
): string | null {
  if (!href || !href.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(href, BASE);
  } catch {
    return null;
  }
  // `//host/path` starts with a slash too, but it leaves the site.
  if (url.origin !== BASE) return null;
  if (url.pathname !== pathname || url.hash !== "") return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "tab") return null;
  return url.searchParams.get("tab");
}
