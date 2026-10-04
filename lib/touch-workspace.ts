export type WorkspaceAction = { label: string; description: string; href: string; ownerOnly?: boolean; hideForTech?: boolean };
export type Workspace = { title: string; description: string; route: string; steps: string[]; actions: WorkspaceAction[] };

export const TOUCH_WORKSPACES: Record<string, Workspace> = {
  repairs: {
    title: "Repairs", description: "Check in a device, follow the work, and hand it back.", route: "/tickets",
    steps: ["Check in", "Repair", "Invoice", "Hand back"],
    actions: [
      { label: "New repair", description: "Start with the customer and device.", href: "/tickets/new" },
      { label: "Find a repair", description: "Open a job and update its progress.", href: "/tickets" },
      { label: "Ready for pickup", description: "Find devices ready to go home.", href: "/tickets?status=Ready%20for%20Pickup" },
      { label: "Overdue repairs", description: "Review work past its promised date.", href: "/tickets?due=overdue" },
    ],
  },
  invoices: {
    title: "Invoices", description: "Create a bill, collect payment, and keep track of what is owed.", route: "/invoices",
    steps: ["Choose customer", "Add items", "Review", "Send or collect"],
    actions: [
      { label: "New invoice", description: "Choose a customer, then add items.", href: "/invoices/new" },
      { label: "Find an invoice", description: "View, print, or send an existing bill.", href: "/invoices" },
      { label: "Unpaid invoices", description: "Sent and part-paid invoices waiting for payment.", href: "/invoices?status=unpaid" },
      { label: "Part-paid invoices", description: "Find invoices with a remaining balance.", href: "/invoices?status=PARTIAL" },
      { label: "Recurring invoices", description: "Manage bills that repeat.", href: "/invoices/recurring" },
      { label: "Estimates", description: "Prepare a quote before billing.", href: "/estimates" },
    ],
  },
  sales: {
    title: "Sales & payments", description: "Tap a product, choose a customer, and take payment.", route: "/pos",
    steps: ["Add products or repair", "Choose customer", "Take payment", "Receipt"],
    actions: [
      { label: "Open register", description: "Sell products or collect a repair payment.", href: "/pos" },
      { label: "Find a receipt", description: "Open the invoice from an earlier sale.", href: "/invoices" },
      { label: "Cash drawers", description: "Open, count, or close a drawer.", href: "/pos/drawers", ownerOnly: true },
    ],
  },
  customers: {
    title: "Customers", description: "Keep customer details, devices, and repair history together.", route: "/customers",
    steps: ["Find or add", "Open customer", "View repairs & invoices"],
    actions: [
      { label: "Find a customer", description: "Search by name, phone, or email.", href: "/customers" },
      { label: "New customer", description: "Add someone to your shop.", href: "/customers/new" },
      { label: "Customer import", description: "Bring in an existing customer list.", href: "/customers/import", hideForTech: true },
      { label: "Enquiries", description: "Follow up with people asking for help.", href: "/leads" },
    ],
  },
  products: {
    title: "Products & parts", description: "Find photos, prices, and stock in one place.", route: "/inventory",
    steps: ["Find a product", "Check stock", "Receive or sell"],
    actions: [
      { label: "Browse products", description: "See parts, accessories, and services.", href: "/inventory" },
      { label: "New product", description: "Add a product, price, and photo.", href: "/inventory/new" },
      { label: "Purchase orders", description: "Order parts and receive deliveries.", href: "/inventory/purchase-orders", ownerOnly: true },
      { label: "Suppliers", description: "Manage where your parts come from.", href: "/inventory/vendors", ownerOnly: true },
      { label: "Product import", description: "Upload an existing product list.", href: "/inventory/import", ownerOnly: true },
    ],
  },
  appointments: {
    title: "Appointments", description: "Book visits and see who is coming to the shop.", route: "/appointments",
    steps: ["Choose a day", "Book a visit", "Check in repair"],
    actions: [
      { label: "Open appointments", description: "View the calendar or book a visit.", href: "/appointments" },
      { label: "Check in a repair", description: "Start a job when the customer arrives.", href: "/tickets/new" },
      { label: "Enquiries", description: "Follow up and arrange a visit.", href: "/leads" },
    ],
  },
  tools: {
    title: "More tools", description: "Everything else your shop needs, grouped in one place.", route: "/settings",
    steps: [],
    actions: [
      { label: "Shop settings", description: "Staff, integrations, and shop preferences.", href: "/settings" },
      { label: "Reports", description: "Review your shop’s performance.", href: "/reports" },
      { label: "Marketing", description: "Manage customer campaigns.", href: "/marketing" },
      { label: "Time clock", description: "Clock in or out and view time entries.", href: "/time-clock" },
      { label: "Shop display", description: "Open the customer-facing display.", href: "/display" },
      { label: "AI assistant settings", description: "Configure your shop assistant.", href: "/settings/assistant", ownerOnly: true },
      { label: "New estimate", description: "Prepare a quote for a customer.", href: "/estimates/new" },
      { label: "Shop overview", description: "Priorities, queues and money at a glance.", href: "/dashboard" },
      { label: "Enquiries", description: "Questions and booking requests.", href: "/leads" },
      { label: "Purchase orders", description: "Order parts and receive deliveries.", href: "/inventory/purchase-orders", ownerOnly: true },
      { label: "Suppliers", description: "Where you buy parts.", href: "/inventory/vendors", ownerOnly: true },
      { label: "Import stock", description: "Excel, CSV or Google Sheets.", href: "/inventory/import", ownerOnly: true },
      { label: "Import customers", description: "Bring in your contact list.", href: "/customers/import", hideForTech: true },
      { label: "Cash drawers", description: "Open, count and close the till.", href: "/pos/drawers", ownerOnly: true },
      { label: "Recurring bills", description: "Invoices that repeat.", href: "/invoices/recurring", hideForTech: true },
    ],
  },
};

export function workspaceActions(workspace: Workspace, role: string) {
  return workspace.actions.filter((action) => (!action.ownerOnly || role === "OWNER") && (!action.hideForTech || role !== "TECH"));
}

/** A reliable return destination, including when a page was opened from a bookmark. */
export function workspaceBack(path: string) {
  if (path.startsWith("/counter/") || path === "/dashboard") return "/counter";
  const entry = Object.entries(TOUCH_WORKSPACES).find(([key, value]) => key !== "tools" && (path === value.route || path.startsWith(`${value.route}/`)));
  if (!entry) {
    if (path.startsWith("/settings/")) return "/settings";
    // A detail page of a list Home does not group (estimates, enquiries, reports…) returns to its own list.
    const [list, ...rest] = path.split("/").filter(Boolean);
    return list && rest.length ? `/${list}` : "/counter";
  }
  const [, value] = entry;
  return path === value.route ? "/counter" : value.route;
}

const PRODUCTS = "/images/products";
const HOME = "/images/home";

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
  "/invoices?status=unpaid": `${HOME}/card-terminal.webp`,
  "/invoices?status=PARTIAL": `${HOME}/card-terminal.webp`,
  "/tickets": `${PRODUCTS}/phone.webp`,
  "/tickets/new": `${PRODUCTS}/phone.webp`,
  "/invoices": `${HOME}/invoice-pad.webp`,
  "/invoices/new": `${HOME}/invoice-pad.webp`,
  "/invoices/recurring": `${HOME}/diary.webp`,
  "/estimates": `${HOME}/invoice-pad.webp`,
  "/estimates/new": `${HOME}/invoice-pad.webp`,
  "/pos": `${HOME}/cash-register.webp`,
  "/pos/drawers": `${HOME}/cash-register.webp`,
  "/customers": `${HOME}/customers-cards.webp`,
  "/customers/new": `${HOME}/customers-cards.webp`,
  "/customers/import": `${HOME}/import-folder.webp`,
  "/leads": `${HOME}/customers-cards.webp`,
  "/inventory": `${HOME}/parts-bin.webp`,
  "/inventory/new": `${HOME}/price-tag.webp`,
  "/inventory/purchase-orders": `${HOME}/delivery-boxes.webp`,
  "/inventory/vendors": `${HOME}/delivery-van.webp`,
  "/inventory/import": `${HOME}/import-folder.webp`,
  "/appointments": `${HOME}/diary.webp`,
  "/settings": `${HOME}/gears.webp`,
  "/settings/assistant": `${HOME}/gears.webp`,
  "/reports": `${HOME}/report-chart.webp`,
  "/dashboard": `${HOME}/report-chart.webp`,
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
