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
}

export interface SettingsGroup {
  /** Empty when the panels are too few to deserve headings. */
  label: string;
  items: SettingsPanel[];
}

/**
 * Owner settings, grouped the way a shop owner thinks about them rather than
 * the order the features happened to be built in. Fourteen flat tabs wrapped
 * onto a second row on a laptop and read as one undifferentiated wall; five
 * short groups do not.
 *
 * Order within a group is deliberate: the thing you configure first comes first.
 */
export const OWNER_PANELS: SettingsPanel[] = [
  {
    value: "shop",
    label: "Shop details",
    blurb: "Your shop's name, address, timezone, tax rates and labour rate.",
    group: "Shop",
    icon: Store,
  },
  {
    value: "workflow",
    label: "Workflow",
    blurb:
      "Problem types, ticket statuses, response targets and repair checklists.",
    group: "Shop",
    icon: ListChecks,
  },
  {
    value: "locations",
    label: "Locations",
    blurb: "The branches you work out of, and which one each person starts in.",
    group: "Shop",
    icon: MapPin,
  },
  {
    value: "canned",
    label: "Canned responses",
    blurb: "Saved replies your team can drop into a message to a customer.",
    group: "Shop",
    icon: MessageSquareText,
  },
  {
    value: "team",
    label: "Team",
    blurb: "Who can sign in, what each of them can do, and pending invites.",
    group: "People",
    icon: Users,
  },
  {
    value: "profile",
    label: "My profile",
    blurb: "Your own name, your password and your two-factor security.",
    group: "People",
    icon: CircleUser,
  },
  {
    value: "payments",
    label: "Payments",
    blurb:
      "Card processing, in-store terminals, and how customers pay an invoice.",
    group: "Money",
    icon: CreditCard,
  },
  {
    // The front door: one screen an owner can work top to bottom. It leads the
    // group because "how do I connect this to my website?" is the first
    // question a new shop asks, and every row below it links to the tab that
    // actually owns that setting.
    value: "connect",
    label: "Connect",
    blurb:
      "Your one shop link, card payments, messages — everything, one button each.",
    group: "Connections",
    icon: Link2,
  },
  {
    value: "messaging",
    label: "Messaging",
    blurb: "How email and text messages leave Repairs helper, and replies come back.",
    group: "Connections",
    icon: Mail,
  },
  {
    value: "checkin",
    label: "Check-in & reviews",
    blurb: "Your public check-in page and the review request sent after pickup.",
    group: "Connections",
    icon: ClipboardCheck,
  },
  {
    value: "integrations",
    label: "Integrations",
    blurb:
      "Accounting sync, and where every other connection in Repairs helper is set up.",
    group: "Connections",
    icon: Plug,
  },
  {
    // Webhooks live on this panel too, and nobody found them under "API keys".
    value: "api-keys",
    label: "API & webhooks",
    blurb: "Keys for the Repairs helper API, and where events get posted to.",
    group: "Connections",
    icon: KeyRound,
  },
  {
    value: "automation",
    label: "Automation",
    blurb: "The background timer: what it sends, and what it did on its last run.",
    group: "System",
    icon: Timer,
  },
  {
    value: "audit",
    label: "Audit log",
    blurb: "A record of who changed what in this shop, and when they did it.",
    group: "System",
    icon: ScrollText,
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
