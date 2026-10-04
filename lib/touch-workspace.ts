/** A small round mark over a hub picture, so look-alike tiles (add vs find) differ by shape, not colour. */
export type HubMark = "add" | "find" | "ask" | "import";

/**
 * What a hub tile can show live: the hub page fills these in from the shop's
 * own numbers ("5 unpaid", "2 ready"). See app/(app)/counter/[area]/hub-counts.ts.
 */
export type HubCountKey =
  | "repairs-open" | "repairs-ready" | "repairs-overdue"
  | "invoices-unpaid" | "invoices-partial" | "recurring-active" | "estimates-open"
  | "customers-total" | "enquiries-new"
  | "stock-low" | "orders-open" | "suppliers-total"
  | "appointments-today" | "drawers-open";

export type WorkspaceAction = {
  label: string;
  description: string;
  href: string;
  ownerOnly?: boolean;
  hideForTech?: boolean;
  /** Picture under /public. Each tile on one hub gets its own, so no two look alike. */
  photo?: string;
  mark?: HubMark;
  /** A live number for the tile (see HubCountKey). */
  count?: HubCountKey;
  /** The count needs someone (ready, overdue, unpaid, low): shown as a pill with its word. */
  alert?: boolean;
  /** Money: hidden from technicians, who see no money anywhere else either. */
  money?: boolean;
};
export type Workspace = { title: string; description: string; route: string; steps: string[]; actions: WorkspaceAction[] };

const PRODUCTS = "/images/products";
const HOME = "/images/home";
const CATALOG = "/images/catalog";

export const TOUCH_WORKSPACES: Record<string, Workspace> = {
  repairs: {
    title: "Repairs", description: "Check in a device, follow the work, and hand it back.", route: "/tickets",
    steps: ["Check in", "Repair", "Invoice", "Hand back"],
    actions: [
      { label: "New repair", description: "Start with the customer and device.", href: "/tickets/new", photo: `${PRODUCTS}/phone.webp`, mark: "add" },
      { label: "Find a repair", description: "Open a job and update its progress.", href: "/tickets", photo: `${PRODUCTS}/repair-tools.webp`, count: "repairs-open" },
      { label: "Ready for pickup", description: "Find devices ready to go home.", href: "/tickets?status=Ready%20for%20Pickup", photo: `${HOME}/pickup-bag.webp`, count: "repairs-ready", alert: true },
      { label: "Overdue repairs", description: "Review work past its promised date.", href: "/tickets?due=overdue", photo: `${HOME}/time-clock.webp`, count: "repairs-overdue", alert: true },
    ],
  },
  invoices: {
    title: "Invoices", description: "Create a bill, collect payment, and keep track of what is owed.", route: "/invoices",
    steps: ["Choose customer", "Add items", "Review", "Send or collect"],
    actions: [
      { label: "New invoice", description: "Choose a customer, then add items.", href: "/invoices/new", photo: `${HOME}/invoice-pad.webp`, mark: "add" },
      { label: "Find an invoice", description: "View, print, or send an existing bill.", href: "/invoices", photo: `${CATALOG}/printer.webp`, mark: "find" },
      { label: "Unpaid invoices", description: "Sent and part-paid invoices waiting for payment.", href: "/invoices?status=unpaid", photo: `${HOME}/card-terminal.webp`, count: "invoices-unpaid", alert: true },
      { label: "Part-paid invoices", description: "Find invoices with a remaining balance.", href: "/invoices?status=PARTIAL", photo: `${HOME}/cash-register.webp`, count: "invoices-partial", alert: true },
      { label: "Recurring invoices", description: "Manage bills that repeat.", href: "/invoices/recurring", photo: `${HOME}/diary.webp`, count: "recurring-active" },
      { label: "Estimates", description: "Prepare a quote before billing.", href: "/estimates", photo: `${HOME}/price-tag.webp`, count: "estimates-open" },
    ],
  },
  sales: {
    title: "Sell & payments", description: "Tap a product, choose a customer, and take payment.", route: "/pos",
    steps: ["Add products or repair", "Choose customer", "Take payment", "Receipt"],
    actions: [
      { label: "New sale", description: "Sell products or collect a repair payment.", href: "/pos", photo: `${HOME}/card-terminal.webp` },
      { label: "Find a receipt", description: "Open the invoice from an earlier sale.", href: "/invoices", photo: `${CATALOG}/printer.webp`, mark: "find" },
      { label: "Cash drawers", description: "Open, count, or close a drawer.", href: "/pos/drawers", ownerOnly: true, photo: `${HOME}/cash-register.webp`, count: "drawers-open" },
    ],
  },
  customers: {
    title: "Customers", description: "Keep customer details, devices, and repair history together.", route: "/customers",
    steps: ["Find or add", "Open customer", "View repairs & invoices"],
    actions: [
      { label: "Find a customer", description: "Search by name, phone, or email.", href: "/customers", photo: `${HOME}/customers-cards.webp`, mark: "find", count: "customers-total" },
      { label: "New customer", description: "Add someone to your shop.", href: "/customers/new", photo: `${HOME}/customers-cards.webp`, mark: "add" },
      { label: "Import customers", description: "Bring in an existing customer list.", href: "/customers/import", hideForTech: true, photo: `${HOME}/import-folder.webp`, mark: "import" },
      { label: "Enquiries", description: "Follow up with people asking for help.", href: "/leads", photo: `${CATALOG}/microphone.webp`, mark: "ask", count: "enquiries-new", alert: true },
    ],
  },
  products: {
    title: "Stock", description: "Find photos, prices, and stock in one place.", route: "/inventory",
    steps: ["Find a product", "Check stock", "Receive or sell"],
    actions: [
      { label: "View stock", description: "See parts, accessories, and services.", href: "/inventory", photo: `${HOME}/parts-bin.webp`, mark: "find" },
      { label: "Add product", description: "Add a product, price, and photo.", href: "/inventory/new", photo: `${HOME}/price-tag.webp`, mark: "add" },
      { label: "Purchase orders", description: "Order parts and receive deliveries.", href: "/inventory/purchase-orders", ownerOnly: true, photo: `${HOME}/delivery-boxes.webp`, count: "orders-open" },
      { label: "Suppliers", description: "Manage where your parts come from.", href: "/inventory/vendors", ownerOnly: true, photo: `${HOME}/delivery-van.webp`, count: "suppliers-total" },
      { label: "Import stock", description: "Upload an existing product list.", href: "/inventory/import", ownerOnly: true, photo: `${HOME}/import-folder.webp`, mark: "import" },
    ],
  },
  appointments: {
    title: "Appointments", description: "Book visits and see who is coming to the shop.", route: "/appointments",
    steps: ["Choose a day", "Book a visit", "Check in repair"],
    actions: [
      { label: "Open appointments", description: "View the calendar or book a visit.", href: "/appointments", photo: `${HOME}/diary.webp`, count: "appointments-today" },
      { label: "Check in a repair", description: "Start a job when the customer arrives.", href: "/tickets/new", photo: `${PRODUCTS}/phone.webp`, mark: "add" },
      { label: "Enquiries", description: "Follow up and arrange a visit.", href: "/leads", photo: `${CATALOG}/microphone.webp`, mark: "ask", count: "enquiries-new", alert: true },
    ],
  },
  tools: {
    title: "More tools", description: "Everything else your shop needs, grouped in one place.", route: "/settings",
    steps: [],
    actions: [
      { label: "Shop settings", description: "Staff, printing and shop preferences.", href: "/settings", photo: `${HOME}/gears.webp` },
      { label: "Reports", description: "Review your shop’s performance.", href: "/reports", photo: `${HOME}/report-chart.webp` },
      { label: "Marketing", description: "Manage customer campaigns.", href: "/marketing", photo: `${HOME}/megaphone.webp` },
      { label: "Time clock", description: "Clock in or out and view time entries.", href: "/time-clock", photo: `${HOME}/time-clock.webp` },
      { label: "Shop display", description: "Open the customer-facing display.", href: "/display", photo: `${HOME}/display-screen.webp` },
      { label: "Assistant settings", description: "Set up the shop assistant.", href: "/settings/assistant", ownerOnly: true, photo: `${CATALOG}/microphone.webp` },
      { label: "New estimate", description: "Prepare a quote for a customer.", href: "/estimates/new", photo: `${HOME}/invoice-pad.webp`, mark: "add" },
      { label: "Shop overview", description: "Priorities, queues and money at a glance.", href: "/dashboard", photo: `${CATALOG}/monitor.webp` },
      { label: "Enquiries", description: "Questions and booking requests.", href: "/leads", photo: `${HOME}/customers-cards.webp`, mark: "ask", count: "enquiries-new", alert: true },
      { label: "Purchase orders", description: "Order parts and receive deliveries.", href: "/inventory/purchase-orders", ownerOnly: true, photo: `${HOME}/delivery-boxes.webp`, count: "orders-open" },
      { label: "Suppliers", description: "Where you buy parts.", href: "/inventory/vendors", ownerOnly: true, photo: `${HOME}/delivery-van.webp` },
      { label: "Import stock", description: "Excel, CSV or Google Sheets.", href: "/inventory/import", ownerOnly: true, photo: `${HOME}/import-folder.webp`, mark: "import" },
      { label: "Import customers", description: "Bring in your contact list.", href: "/customers/import", hideForTech: true, photo: `${CATALOG}/usb-flash-drive.webp`, mark: "import" },
      { label: "Cash drawers", description: "Open, count and close the till.", href: "/pos/drawers", ownerOnly: true, photo: `${HOME}/cash-register.webp`, count: "drawers-open" },
      { label: "Recurring bills", description: "Invoices that repeat.", href: "/invoices/recurring", hideForTech: true, photo: `${HOME}/diary.webp`, count: "recurring-active" },
    ],
  },
};

export function workspaceActions(workspace: Workspace, role: string) {
  return workspace.actions.filter((action) => (!action.ownerOnly || role === "OWNER") && (!action.hideForTech || role !== "TECH") && (!action.money || role !== "TECH"));
}

/* -------------------------------------------------------------------------- */
/* Back                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every signed-in screen, as a pattern (`[id]` is any one segment). Back walks
 * up the address until it lands on one of these, so a deep page always has a
 * real parent: Edit customer goes to the customer, a supplier to Suppliers, a
 * purchase order to Purchase orders, a recurring schedule to Recurring.
 */
const SCREENS = [
  "/appointments", "/counter", "/counter/[id]", "/dashboard", "/display", "/reports", "/setup", "/time-clock",
  "/customers", "/customers/new", "/customers/import", "/customers/[id]", "/customers/[id]/edit", "/customers/[id]/statement",
  "/estimates", "/estimates/new", "/estimates/[id]", "/estimates/[id]/edit",
  "/inventory", "/inventory/new", "/inventory/import", "/inventory/[id]", "/inventory/[id]/edit", "/inventory/[id]/label",
  "/inventory/purchase-orders", "/inventory/purchase-orders/new", "/inventory/purchase-orders/[id]",
  "/inventory/vendors", "/inventory/vendors/[id]",
  "/invoices", "/invoices/new", "/invoices/[id]", "/invoices/[id]/edit",
  "/invoices/recurring", "/invoices/recurring/new", "/invoices/recurring/[id]", "/invoices/recurring/[id]/edit",
  "/leads", "/leads/new", "/leads/[id]",
  "/marketing", "/marketing/new", "/marketing/[id]", "/marketing/[id]/edit",
  "/pos", "/pos/drawers",
  "/settings", "/settings/assistant", "/settings/integrations/xero-tenant",
  "/tickets", "/tickets/new", "/tickets/[id]",
].map((pattern) => pattern.split("/").filter(Boolean));

/** The fixed words of every screen: "new" is never an id, "vendors" never a product. */
const STATIC_SEGMENTS = new Set(SCREENS.flatMap((parts) => parts.filter((part) => part !== "[id]")));

function screenPattern(path: string): string[] | null {
  const parts = path.split("/").filter(Boolean);
  // Exact words beat an id: /inventory/vendors is Suppliers, not a product called "vendors".
  const exact = SCREENS.find((pattern) => pattern.length === parts.length && pattern.every((part, index) => part === parts[index]));
  if (exact) return exact;
  return SCREENS.find((pattern) => pattern.length === parts.length && pattern.every((part, index) => part === parts[index] || (part === "[id]" && !STATIC_SEGMENTS.has(parts[index])))) ?? null;
}

/** Is this a screen of the signed-in app (any page in the table above)? */
export function isAppScreen(path: string): boolean {
  return screenPattern(path.split(/[?#]/)[0]) !== null;
}

/**
 * Where Back goes when there is no earlier screen in this visit to return to
 * (a bookmark, a link from an email, a fresh tab): the nearest real screen
 * above this one, and Home from a first-level page.
 */
export function workspaceBack(path: string) {
  const clean = path.split(/[?#]/)[0];
  if (clean === "/counter" || clean.startsWith("/counter/") || clean === "/dashboard") return "/counter";
  const parts = clean.split("/").filter(Boolean);
  // An address the app does not know (an old link, a typo) goes to its area's list.
  if (!screenPattern(clean)) return parts.length > 1 ? `/${parts[0]}` : "/counter";
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    const candidate = `/${parts.slice(0, length).join("/")}`;
    if (screenPattern(candidate)) return candidate;
  }
  return "/counter";
}

/** An entry form: going "back" into one after saving would only show an empty form again. */
export function isEntryForm(path: string): boolean {
  return /\/(?:new|edit)$/.test(path.split(/[?#]/)[0]);
}

const LIST_NAMES: Record<string, string> = {
  "/counter": "Home",
  "/tickets": "Repairs",
  "/customers": "Customers",
  "/invoices": "Invoices",
  "/invoices/recurring": "Recurring",
  "/estimates": "Estimates",
  "/inventory": "Stock",
  "/inventory/vendors": "Suppliers",
  "/inventory/purchase-orders": "Purchase orders",
  "/inventory/import": "Import stock",
  "/customers/import": "Import customers",
  "/leads": "Enquiries",
  "/appointments": "Appointments",
  "/pos": "Sell",
  "/pos/drawers": "Cash drawers",
  "/reports": "Reports",
  "/settings": "Settings",
  "/marketing": "Marketing",
  "/time-clock": "Time clock",
  "/dashboard": "Shop overview",
  "/display": "Shop display",
  "/setup": "Setup",
};

const RECORD_NAMES: Record<string, string> = {
  tickets: "Repair",
  customers: "Customer",
  invoices: "Invoice",
  estimates: "Estimate",
  inventory: "Product",
  leads: "Enquiry",
  marketing: "Campaign",
};

/**
 * What a screen is called on a Back button ("Back to Repairs"): the plain
 * names the shop uses, never the address. A filtered list keeps its list name;
 * the Pickup counter is named for what it is.
 */
export function screenName(href: string): string {
  const [path, query = ""] = href.split("?");
  if (path === "/tickets" && /status=Ready(?:%20|\+| )for(?:%20|\+| )Pickup/i.test(query)) return "Pickup";
  if (LIST_NAMES[path]) return LIST_NAMES[path];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "counter" && parts[1]) return TOUCH_WORKSPACES[parts[1]]?.title ?? "Home";
  if (parts[0] === "settings") return "Settings";
  if (path.startsWith("/inventory/vendors/")) return "Supplier";
  if (path.startsWith("/inventory/purchase-orders/")) return "Purchase order";
  if (path.startsWith("/invoices/recurring/")) return "Recurring bill";
  if (parts.length >= 2 && RECORD_NAMES[parts[0]]) return RECORD_NAMES[parts[0]];
  return LIST_NAMES[`/${parts[0] ?? ""}`] ?? "Home";
}

/* -------------------------------------------------------------------------- */
/* Pictures                                                                    */
/* -------------------------------------------------------------------------- */

/** The picture for each area's header: the same photos the Home tiles use. */
const WORKSPACE_PHOTO: Record<string, string> = {
  repairs: `${PRODUCTS}/phone.webp`,
  invoices: `${HOME}/invoice-pad.webp`,
  sales: `${HOME}/cash-register.webp`,
  customers: `${HOME}/customers-cards.webp`,
  products: `${HOME}/parts-bin.webp`,
  appointments: `${HOME}/diary.webp`,
  tools: `${HOME}/toolbox.webp`,
};

/** Exact links (with their filter) first, then the page, so "Unpaid invoices" and "All invoices" can differ. */
const ACTION_PHOTO: Record<string, string> = {
  "/tickets?status=Ready%20for%20Pickup": `${HOME}/pickup-bag.webp`,
  "/tickets?due=overdue": `${HOME}/time-clock.webp`,
  "/invoices?status=unpaid": `${HOME}/card-terminal.webp`,
  "/invoices?status=PARTIAL": `${HOME}/cash-register.webp`,
  "/tickets": `${PRODUCTS}/phone.webp`,
  "/tickets/new": `${PRODUCTS}/phone.webp`,
  "/invoices": `${HOME}/invoice-pad.webp`,
  "/invoices/new": `${HOME}/invoice-pad.webp`,
  "/invoices/recurring": `${HOME}/diary.webp`,
  "/estimates": `${HOME}/price-tag.webp`,
  "/estimates/new": `${HOME}/invoice-pad.webp`,
  "/pos": `${HOME}/card-terminal.webp`,
  "/pos/drawers": `${HOME}/cash-register.webp`,
  "/customers": `${HOME}/customers-cards.webp`,
  "/customers/new": `${HOME}/customers-cards.webp`,
  "/customers/import": `${HOME}/import-folder.webp`,
  "/leads": `${HOME}/customers-cards.webp`,
  "/inventory": `${HOME}/parts-bin.webp`,
  "/inventory?filter=low": `${PRODUCTS}/screen-protector.webp`,
  "/inventory/new": `${HOME}/price-tag.webp`,
  "/inventory/purchase-orders": `${HOME}/delivery-boxes.webp`,
  "/inventory/vendors": `${HOME}/delivery-van.webp`,
  "/inventory/import": `${HOME}/import-folder.webp`,
  "/appointments": `${HOME}/diary.webp`,
  "/settings": `${HOME}/gears.webp`,
  "/settings/assistant": `${CATALOG}/microphone.webp`,
  "/reports": `${HOME}/report-chart.webp`,
  "/dashboard": `${CATALOG}/monitor.webp`,
  "/marketing": `${HOME}/megaphone.webp`,
  "/time-clock": `${HOME}/time-clock.webp`,
  "/display": `${HOME}/display-screen.webp`,
};

export function workspacePhoto(key: string): string {
  return WORKSPACE_PHOTO[key] ?? `${HOME}/toolbox.webp`;
}

/** Every action on a hub screen gets a picture; anything unmapped falls back to the area's own. */
export function actionPhoto(href: string, fallback: string): string {
  return ACTION_PHOTO[href] ?? ACTION_PHOTO[href.split("?")[0]] ?? fallback;
}

/** The tile picture for one hub action: its own, then the page's, then the hub's. */
export function hubTilePhoto(action: WorkspaceAction, fallback: string): string {
  return action.photo ?? actionPhoto(action.href, fallback);
}
