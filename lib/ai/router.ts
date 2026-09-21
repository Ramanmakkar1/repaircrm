/**
 * The assistant's router, on Jev (lib/ai/jev.ts).
 *
 * Jev answers typed questions — "which of these actions?", "which of the
 * shop's statuses?", "yes or no: only my repairs?" — with probabilities, and it
 * does it fast and cheaply. What it does NOT do is write text: it cannot come up
 * with "iPhone 6 Screen", "$45" or a note. So the work splits on that line:
 *
 *   - Jev decides WHAT the person wants, and every closed-set detail of it,
 *     in one request with all questions asked side by side (they are
 *     independent, so they run in parallel and are simply ignored when unused).
 *   - Code fills what code can read exactly: a ticket number typed as digits,
 *     or the ticket already on screen.
 *   - Anything that needs words or amounts pulled out of the sentence goes to
 *     the generative interpreter, told which action Jev picked.
 *   - When Jev is not sure which action was meant, the person is asked — with
 *     the two likeliest readings — instead of the assistant guessing.
 *
 * The result is the same `AssistantIntent` the generative path produces, so the
 * server acting on it (app/(app)/assistant/actions.ts), including every confirm
 * step, is unchanged.
 */

import type { AssistantContext, AssistantIntent } from "./assistant";
import { ASSISTANT_PAGES, SUMMARY_PERIODS } from "./assistant-vocab";
import { askJev, type JevAnswer, type JevChoice, type JevQuestion } from "./jev";

type Action =
  | AssistantIntent["action"]
  | "other_shop_task"
  | "not_about_shop";

/**
 * The actions, each described the way a shop worker would ask for it. The
 * descriptions ARE the model's definition of each option, so they carry the
 * contrasts that matter ("ready for pickup" the question vs the message).
 */
const ACTIONS: Record<Exclude<Action, "clarify" | "refuse">, string> = {
  find_tickets:
    "List or look up repair jobs: what's ready for pickup, what's in progress, what's late, my repairs, a customer's repairs, or one repair by its number.",
  set_ticket_status:
    "Move a repair to a different status, e.g. 'mark 1042 ready for pickup', 'put 1007 in progress', 'close 1003'. Changes the repair; does not message anyone.",
  notify_ready:
    "Tell or text or email a customer that their repair is ready to collect.",
  add_ticket_note: "Write a note on a repair, e.g. 'note on 1042: battery is swollen'.",
  find_customers: "Look up a customer or their phone number or email.",
  create_customer: "Add a new customer to the shop's customer list.",
  find_invoices: "Look up invoices, bills, who owes money, unpaid or outstanding balances.",
  sales_summary: "How the shop did: money taken, sales, takings, revenue, repairs finished — for a day, week or month.",
  appointments: "Who is booked in or coming in today or tomorrow; the appointment calendar.",
  open_page:
    "Go to or open a screen, or start something new: check in a device / new repair, new customer, new estimate, new invoice, new product, the register, settings, reports and similar.",
  low_stock: "What stock is running low or needs reordering.",
  search_products: "Look up products or parts in stock, how many are left, or their price.",
  add_product: "Create a brand-new product that is not in the catalogue yet.",
  adjust_stock: "Add stock to or take stock off an existing product by an amount, e.g. 'received 20 screens'.",
  set_stock: "Set an existing product's stock to an exact count after counting it.",
  set_price: "Change the selling price of an existing product.",
  remove_product: "Remove, delete or hide a product from the catalogue.",
  other_shop_task:
    "A shop task that none of the above covers, e.g. take a payment, refund, delete a customer or ticket, send a marketing campaign.",
  not_about_shop:
    "Not about running this repair shop at all: general questions, chit-chat, maths, writing code, other software.",
};

/** In plain words, for "Did you mean…?". */
const ACTION_LABEL: Record<keyof typeof ACTIONS, string> = {
  find_tickets: "look up repairs",
  set_ticket_status: "move a repair to another status",
  notify_ready: "tell a customer their repair is ready",
  add_ticket_note: "add a note to a repair",
  find_customers: "find a customer",
  create_customer: "add a new customer",
  find_invoices: "look up invoices and who owes money",
  sales_summary: "see how the shop did",
  appointments: "see who's booked in",
  open_page: "open a screen",
  low_stock: "see what's running low",
  search_products: "look up stock",
  add_product: "add a new product",
  adjust_stock: "add or remove stock",
  set_stock: "set a stock count",
  set_price: "change a price",
  remove_product: "remove a product",
  other_shop_task: "do something on another screen",
  not_about_shop: "ask something outside the shop",
};

/** Actions whose details are words or amounts — only the generative path can fill them. */
const NEEDS_WORDS: ReadonlySet<string> = new Set([
  "add_product",
  "search_products",
  "adjust_stock",
  "set_stock",
  "set_price",
  "remove_product",
  "add_ticket_note",
  "create_customer",
  "find_customers",
]);

const PAGE_LABEL: Record<(typeof ASSISTANT_PAGES)[number], string> = {
  dashboard: "the dashboard / home overview",
  new_ticket: "check in a device, start a new repair ticket",
  new_customer: "add a new customer",
  new_estimate: "write a new estimate / quote",
  new_invoice: "write a new invoice / bill",
  new_product: "add a new product to stock",
  tickets: "the list of repair tickets",
  customers: "the customer list",
  estimates: "the list of estimates / quotes",
  invoices: "the list of invoices",
  pos: "the register / point of sale / till / take a payment at the counter",
  inventory: "the stock / inventory / parts list",
  purchase_orders: "purchase orders to suppliers",
  appointments: "the appointment calendar",
  leads: "leads / enquiries",
  marketing: "marketing campaigns",
  reports: "reports and charts",
  time_clock: "the staff time clock / clock in and out",
  shop_display: "the TV display board for the shop",
  settings: "settings in general",
  settings_payments: "payment and card machine settings",
  settings_team: "staff / team members / invite someone",
  settings_taxes: "tax rates",
  settings_messaging: "email and text message settings",
  settings_saved_replies: "saved replies / canned responses",
};

/** Below this, the person is asked which of the two readings they meant. */
export const ACTION_CONFIDENCE = 0.55;

export type RouteResult =
  /** Fully decided — act on it. */
  | { kind: "intent"; intent: AssistantIntent; confidence: number }
  /** Jev knows the action; the generative path must pull the words out. */
  | { kind: "needs_words"; action: string; confidence: number }
  /** Jev could not answer (outage, key problem) — use the generative path. */
  | { kind: "unavailable"; reason: string };

function choiceOf(answer: JevAnswer | undefined): JevChoice | null {
  return answer && answer.type === "choice" ? answer : null;
}

function yes(answer: JevAnswer | undefined): boolean {
  return Boolean(answer && answer.type === "noul" && answer.noul >= 0.5);
}

/**
 * Ticket numbers typed as digits: "1042", "#1042". A price ("$45", "45.50") is
 * not one. A phone number splits into several groups and so reads as "more
 * than one number", which the caller hands to the generative path.
 */
export function ticketNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/(?:^|[^\d$.,])#?(\d{3,7})(?![\d.,])/g)) {
    found.add(Number(match[1]));
  }
  return [...found];
}

export async function routeWithJev(
  text: string,
  context: AssistantContext,
): Promise<RouteResult> {
  const statuses = context.statuses?.length ? context.statuses : ["New", "In Progress", "Ready for Pickup", "Resolved"];

  const statusCriteria: Record<string, string | null> = { none: "No particular status was mentioned." };
  for (const status of statuses) statusCriteria[status] = null;

  const questions: Record<string, JevQuestion> = {
    action: {
      type: "choice",
      instructions:
        "`request` is what a repair-shop worker just said or typed to the shop's assistant (any language). `current_screen` is what they are looking at, and `earlier_requests` are what they asked just before — use them only to understand a follow-up. Which ONE action do they want?",
      criteria: ACTIONS,
    },
    status: {
      type: "choice",
      instructions:
        "If the request is about repairs in a particular status (to list them or to move one to it), which of the shop's own statuses is meant?",
      criteria: statusCriteria,
    },
    period: {
      type: "choice",
      instructions: "If the request asks how the shop did, which period does it mean? Today when none is said.",
      criteria: {
        today: "today",
        yesterday: "yesterday",
        this_week: "this week",
        this_month: "this month",
      },
    },
    day: {
      type: "choice",
      instructions: "If the request is about appointments, which day? Today when none is said.",
      criteria: { today: "today", tomorrow: "tomorrow" },
    },
    page: {
      type: "choice",
      instructions: "If the request is to open a screen or start something new, which one?",
      criteria: PAGE_LABEL,
    },
    mine: {
      type: "noul",
      instructions: "Does the request ask only about repairs assigned to the person asking ('my repairs', 'my jobs')?",
    },
    overdue: {
      type: "noul",
      instructions: "Does the request ask about repairs that are late, overdue or past their promised time?",
    },
    unpaid: {
      type: "noul",
      instructions: "Does the request ask only about unpaid or outstanding invoices — who owes money?",
    },
    names_person: {
      type: "noul",
      instructions:
        "Does the request name a specific customer or person (e.g. 'John', 'Mrs Khan', 'Rivera Landscaping')? Pronouns like 'me' or 'my' do not count.",
    },
  };

  const asked = await askJev(
    {
      request: text,
      current_screen: context.currentTicketNumber
        ? `repair ticket #${context.currentTicketNumber}`
        : "not a repair ticket",
      earlier_requests: context.history ?? [],
    },
    questions,
  );
  if (!asked.ok) return { kind: "unavailable", reason: asked.reason };

  const action = choiceOf(asked.answers.action);
  if (!action || !(action.choice in ACTIONS)) {
    return { kind: "unavailable", reason: "typesafe answered without an action" };
  }
  const chosen = action.choice as keyof typeof ACTIONS;
  const confidence = action.confidence;

  if (confidence < ACTION_CONFIDENCE) {
    const [first, second] = Object.entries(action.probabilities)
      .filter(([key]) => key in ACTION_LABEL && key !== "not_about_shop")
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => ACTION_LABEL[key as keyof typeof ACTION_LABEL]);
    return {
      kind: "intent",
      confidence,
      intent: {
        action: "clarify",
        message: second
          ? `Just to check — do you want to ${first}, or ${second}?`
          : `Just to check — do you want to ${first ?? "do something in the shop"}? Say a little more.`,
      },
    };
  }

  if (chosen === "not_about_shop") {
    return {
      kind: "intent",
      confidence,
      intent: {
        action: "refuse",
        message: "I stick to running your shop — try asking what's ready for pickup, or how today went.",
      },
    };
  }
  if (chosen === "other_shop_task") {
    return {
      kind: "intent",
      confidence,
      intent: {
        action: "refuse",
        message: "I can't do that one from here yet — it's done on its own screen. Ask me to open it for you.",
      },
    };
  }

  if (NEEDS_WORDS.has(chosen)) return { kind: "needs_words", action: chosen, confidence };

  const namesPerson = yes(asked.answers.names_person);
  const numbers = ticketNumbers(text);
  // Two numbers is a sentence code can't read safely ("move 1042 and 1043");
  // let the generative path make sense of it.
  if (numbers.length > 1) return { kind: "needs_words", action: chosen, confidence };
  const ticket = numbers[0] ?? context.currentTicketNumber ?? null;
  const status = choiceOf(asked.answers.status)?.choice;
  const namedStatus = status && status !== "none" ? status : null;

  switch (chosen) {
    case "find_tickets":
      if (namesPerson) return { kind: "needs_words", action: chosen, confidence };
      return {
        kind: "intent",
        confidence,
        intent: {
          action: "find_tickets",
          status: namedStatus,
          customer: null,
          number: numbers[0] ?? null,
          mine: yes(asked.answers.mine),
          overdue: yes(asked.answers.overdue),
        },
      };
    case "find_invoices":
      if (namesPerson) return { kind: "needs_words", action: chosen, confidence };
      return {
        kind: "intent",
        confidence,
        intent: {
          action: "find_invoices",
          unpaid: yes(asked.answers.unpaid),
          customer: null,
          number: numbers[0] ?? null,
        },
      };
    case "sales_summary": {
      const period = choiceOf(asked.answers.period)?.choice;
      return {
        kind: "intent",
        confidence,
        intent: {
          action: "sales_summary",
          period: (SUMMARY_PERIODS as readonly string[]).includes(period ?? "")
            ? (period as (typeof SUMMARY_PERIODS)[number])
            : "today",
        },
      };
    }
    case "appointments":
      return {
        kind: "intent",
        confidence,
        intent: {
          action: "appointments",
          day: choiceOf(asked.answers.day)?.choice === "tomorrow" ? "tomorrow" : "today",
        },
      };
    case "low_stock":
      return { kind: "intent", confidence, intent: { action: "low_stock" } };
    case "open_page": {
      const page = choiceOf(asked.answers.page)?.choice;
      if (!page || !(ASSISTANT_PAGES as readonly string[]).includes(page)) {
        return { kind: "needs_words", action: chosen, confidence };
      }
      // "Check in a phone for Sarah Khan" needs Sarah's name pulled out.
      if (namesPerson) return { kind: "needs_words", action: chosen, confidence };
      return {
        kind: "intent",
        confidence,
        intent: { action: "open_page", page: page as (typeof ASSISTANT_PAGES)[number], customer: null },
      };
    }
    case "set_ticket_status":
      if (!ticket) {
        return { kind: "intent", confidence, intent: { action: "clarify", message: "Which repair number?" } };
      }
      if (!namedStatus) {
        return {
          kind: "intent",
          confidence,
          intent: { action: "clarify", message: `Which status should repair #${ticket} move to?` },
        };
      }
      return { kind: "intent", confidence, intent: { action: "set_ticket_status", ticket, status: namedStatus } };
    case "notify_ready":
      if (!ticket) {
        return { kind: "intent", confidence, intent: { action: "clarify", message: "Which repair number is ready?" } };
      }
      return { kind: "intent", confidence, intent: { action: "notify_ready", ticket } };
  }

  return { kind: "needs_words", action: chosen, confidence };
}
