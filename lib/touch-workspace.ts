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
      { label: "Unpaid invoices", description: "See invoices waiting for payment.", href: "/invoices?status=SENT" },
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
  if (!entry) return "/counter/tools";
  const [key, value] = entry;
  return path === value.route ? `/counter/${key}` : value.route;
}
