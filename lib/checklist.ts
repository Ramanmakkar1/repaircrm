/**
 * Ticket checklists.
 *
 * A template is a named list of strings (`ChecklistTemplate.items`). Attaching
 * one COPIES those strings onto the ticket as `Ticket.checklist`, so editing a
 * template later never rewrites work already in progress — the same snapshot
 * rule invoices use for tax and warranty.
 *
 * Pure — imported by the ticket card, the checklist card and the server
 * actions alike, so no `db`, no `next/*`, no "use server".
 */

/** One row on a ticket's checklist. `doneAt` is an ISO string when ticked. */
export type ChecklistItem = {
  label: string;
  done: boolean;
  doneAt?: string | null;
};

export const MAX_CHECKLIST_ITEMS = 40;
export const MAX_CHECKLIST_LABEL = 120;

/** Reads the loosely-typed `Ticket.checklist` Json into rows we can trust. */
export function parseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const out: ChecklistItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const label =
      typeof row.label === "string" ? row.label.trim().slice(0, MAX_CHECKLIST_LABEL) : "";
    if (!label) continue;
    out.push({
      label,
      done: row.done === true,
      doneAt: typeof row.doneAt === "string" ? row.doneAt : null,
    });
    if (out.length >= MAX_CHECKLIST_ITEMS) break;
  }
  return out;
}

/** Reads a template's `items` Json — a plain `string[]`. */
export function parseTemplateItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const label = raw.trim().slice(0, MAX_CHECKLIST_LABEL);
    if (!label) continue;
    out.push(label);
    if (out.length >= MAX_CHECKLIST_ITEMS) break;
  }
  return out;
}

/** Template items -> a fresh, all-unticked checklist for a ticket. */
export function checklistFromTemplate(items: string[]): ChecklistItem[] {
  return parseTemplateItems(items).map((label) => ({ label, done: false }));
}

export type ChecklistProgress = { done: number; total: number };

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/** "3 of 7" — the label on both the card and the list chip. */
export function progressLabel(progress: ChecklistProgress): string {
  return `${progress.done} of ${progress.total}`;
}
