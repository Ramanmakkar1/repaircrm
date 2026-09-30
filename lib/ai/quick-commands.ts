import type { AssistantContext, AssistantIntent } from "./assistant";

/** Complete, unambiguous read commands only. Unknown wording goes to the
 * interpreter; never guess a write, drop a filter, or reuse a cached answer. */
export function quickCommand(input: string, context: AssistantContext = {}): AssistantIntent | null {
  if (input.length > 500 || /[\n\r;]/.test(input)) return null;
  let text = input.trim().toLowerCase().replace(/[’]/g, "'").replace(/[?.!。？！।]+$/, "").replace(/\s+/g, " ")
    .replace(/^(?:please |can you |could you )/, "").replace(/ please$/, "");
  // Exact common phrases only. Richer or mixed-language requests keep their
  // full wording and use the interpreter rather than silently losing detail.
  const phrases: Record<string, string> = {
    "कम स्टॉक": "low stock", "कौन सा स्टॉक कम है": "low stock", "आज की बिक्री": "sales today",
    "stock kam hai": "low stock", "aaj ki sales": "sales today",
    "ਘੱਟ ਸਟਾਕ": "low stock", "ਅੱਜ ਦੀ ਵਿਕਰੀ": "sales today",
    "库存不足": "low stock", "低库存": "low stock", "庫存不足": "low stock",
    "今天的销售额": "sales today", "今天的銷售額": "sales today", "今天的预约": "appointments today",
    "mababang stock": "low stock", "kulang na stock": "low stock", "benta ngayon": "sales today",
  };
  text = phrases[text] ?? text;
  if (/^(?:help|what can you (?:do|help me with)|how do i use (?:this|the assistant))$/.test(text)) {
    return { action: "clarify", message: "I can find repairs, customers and parts, check low stock, show appointments and shop totals, or open a screen. Try ‘Find customer Sarah’, ‘Show repair 1042’ or ‘Low stock’. You can also ask to update a repair or inventory. After speaking, review the words before sending." };
  }
  if (/^(?:(?:show|check|list) (?:me )?)?(?:low stock|low inventory|stock to reorder)$/.test(text) || /^(?:what(?:'s| is) (?:running )?low(?: on stock)?|anything low)$/.test(text)) return { action: "low_stock" };
  if (/^(?:my (?:repairs|tickets|jobs)|show (?:me )?my (?:repairs|tickets|jobs))$/.test(text)) return { action: "find_tickets", mine: true };
  if (/^(?:(?:show|list) (?:me )?)?(?:overdue|late) (?:repairs|tickets|jobs)$/.test(text) || /^which (?:repairs|tickets|jobs) are (?:late|overdue)$/.test(text)) return { action: "find_tickets", overdue: true };
  if (/^(?:(?:show|list) (?:me )?)?(?:open )?(?:repairs|tickets|jobs)$/.test(text)) return { action: "find_tickets" };
  const ready = /^(?:what(?:'s| is) |(?:show|list) (?:me )?)?ready for (?:pickup|pick up|collection)$/.test(text);
  if (ready) {
    const status = context.statuses?.find(s => s.toLowerCase() === "ready for pickup");
    return status ? { action: "find_tickets", status } : null;
  }
  const number = text.match(/^(?:(?:show|find|look up|check|open) (?:me )?)?(repair|ticket|job|invoice) (?:number |#)?(\d{1,7})$/);
  if (number && Number(number[2]) > 0) return { action: number[1] === "invoice" ? "find_invoices" : "find_tickets", number: Number(number[2]) };
  if (/^(?:(?:show|list) (?:me )?)?(?:unpaid|outstanding) invoices$/.test(text) || /^who owes (?:us|me|money)$/.test(text)) return { action: "find_invoices", unpaid: true };
  const appointments = text.match(/^(?:appointments(?: for)?|who(?:'s| is) (?:coming|booked) in) (today|tomorrow)$/);
  if (appointments) return { action: "appointments", day: appointments[1] as "today" | "tomorrow" };
  const summary = text.match(/^(?:sales|sales summary|revenue|takings|how did we do)(?: for)? (today|yesterday|this week|this month)$/)
    ?? text.match(/^(today|yesterday|this week|this month)(?:'s)? (?:sales|summary|numbers)$/);
  if (summary) return { action: "sales_summary", period: summary[1].replace(/ /g, "_") as "today" | "yesterday" | "this_week" | "this_month" };
  const lookup = text.match(/^(?:find|search|look up)(?: for)? (customer|customers|part|parts|product|products|stock) (.{2,160})$/);
  if (lookup && !/\b(?:and|then|except|but|not|only|with|without)\b/.test(lookup[2])) return { action: /customer/.test(lookup[1]) ? "find_customers" : "search_products", query: lookup[2] };
  const pages: Record<string, Extract<AssistantIntent, { action: "open_page" }>["page"]> = {
    dashboard: "dashboard", home: "dashboard", register: "pos", pos: "pos", inventory: "inventory", customers: "customers", repairs: "tickets", tickets: "tickets", appointments: "appointments", settings: "settings", reports: "reports", invoices: "invoices", "new repair": "new_ticket", "new customer": "new_customer", "new invoice": "new_invoice", "payment settings": "settings_payments",
  };
  const page = text.match(/^(?:open|go to|take me to) (?:the )?(.+)$/)?.[1];
  return page && pages[page] ? { action: "open_page", page: pages[page] } : null;
}

export type CommandSuggestion = { label: string; command: string; detail: string };
const EXAMPLES = ["Low stock", "My repairs", "Overdue repairs", "Ready for pickup", "Appointments today", "Appointments tomorrow", "Sales today", "Sales this week", "Unpaid invoices", "Open register", "Open inventory", "Open new repair", "Help"];
export function commandSuggestions(input: string, showMoney: boolean): CommandSuggestion[] {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return EXAMPLES.filter(command => (showMoney || !/sales|invoices/i.test(command)) && words.every(word => command.toLowerCase().includes(word)))
    .slice(0, 4).map(command => ({ label: command, command, detail: "Quick command" }));
}
