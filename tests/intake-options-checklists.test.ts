import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Only the first paint is read: nothing here navigates or saves.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(app)/settings/checklist-actions", () => ({
  saveChecklistTemplateAction: vi.fn(),
  setChecklistTemplateActiveAction: vi.fn(),
}));
vi.mock("@/app/(app)/settings/actions", () => ({ saveIntakeOptionsAction: vi.fn(), updateWorkflowAction: vi.fn() }));

import { ChecklistsCard, type ChecklistTemplateItem } from "@/components/settings/checklists-card";
import { IntakeOptionsEditor } from "@/components/settings/intake-options-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_DEVICE_KINDS } from "@/lib/intake-options";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const template = (name: string, problemType: string | null): ChecklistTemplateItem => ({ id: name, name, problemType, items: ["Look", "Test"] });

function card(templates: ChecklistTemplateItem[], problemTypes: string[]) {
  // The delete button's tooltip needs the provider the app shell supplies.
  return renderToStaticMarkup(createElement(TooltipProvider, null, createElement(ChecklistsCard, { templates, problemTypes })));
}

describe("the Checklists card says when a checklist has lost its problem", () => {
  const problems = ["Screen Repair", "Diagnostics", "Other"];

  it("shows a checklist whose problem is on the list as it always did", () => {
    const html = text(card([template("Laptop intake", "Diagnostics")], problems));
    expect(html).toContain("Laptop intake");
    expect(html).toContain("2 steps · auto-attaches to Diagnostics");
    expect(html).not.toContain("Not attached");
  });

  it("flags one whose problem is gone, in words, and says what to do", () => {
    // The problem was renamed or removed somewhere the checklist was not told about.
    const html = text(card([template("Laptop intake", "Diagnostic")], problems));
    expect(html).toContain("Not attached");
    expect(html).toContain("“Diagnostic” is not on your problem list, so this checklist is not added to new repairs. Edit it to pick another problem.");
    expect(html).not.toContain("auto-attaches to Diagnostic");
  });

  it("matches the problem by its exact name, as a new repair does", () => {
    expect(text(card([template("Laptop intake", "diagnostics")], problems))).toContain("Not attached");
  });

  it("does not flag a checklist that is picked by hand", () => {
    const html = text(card([template("QC pass", null)], problems));
    expect(html).toContain("picked by hand");
    expect(html).not.toContain("Not attached");
  });

  it("flags only the checklists that need it", () => {
    const html = text(card([template("A", "Diagnostics"), template("B", "Gone"), template("C", null)], problems));
    expect(html.split("Not attached").length - 1).toBe(1);
  });

  it("keeps the flag out of the theme-only rule: no hex colours, no coloured side stripes", () => {
    const html = card([template("B", "Gone")], problems);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/border-[lr]-\d|border-l-|border-r-/);
  });
});

describe("the devices and problems editor with checklists", () => {
  it("draws exactly as before when it is given the shop's checklists", () => {
    const props = { deviceKinds: DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind })), problemTypes: ["Screen Repair", "Diagnostic", "Other"], problemPictures: {} };
    const without = renderToStaticMarkup(createElement(IntakeOptionsEditor, props));
    const withChecklists = renderToStaticMarkup(createElement(IntakeOptionsEditor, { ...props, checklists: [template("Laptop intake", "Diagnostic")] }));
    expect(withChecklists).toBe(without);
    // the warning is only said when something is about to change, never on first paint
    expect(text(withChecklists)).not.toContain("will not attach");
    expect(text(withChecklists)).not.toContain("stops attaching");
  });
});
