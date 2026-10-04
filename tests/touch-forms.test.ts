import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The create-repair server action pulls in the database; the form only needs a function to post to.
vi.mock("@/app/(app)/tickets/actions", () => ({ createTicketAction: vi.fn() }));

// Records how each form configures the guided-form hook, then runs the real hook.
const hook = vi.hoisted(() => ({ calls: [] as { enabled: boolean; staged?: boolean }[] }));
vi.mock("@/components/ui/guided-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/guided-form")>();
  return {
    ...actual,
    useGuidedForm: (options: Parameters<typeof actual.useGuidedForm>[0]) => {
      hook.calls.push({ enabled: options.enabled, staged: options.staged });
      return actual.useGuidedForm(options);
    },
  };
});

import { DocumentForm } from "@/components/billing/document-form";
import { TicketForm } from "@/components/tickets/ticket-form";
import { EntryMode } from "@/components/ui/entry-mode";
import { GuidedErrors, GuidedNavigation, GuidedReview, GuidedSteps, useGuidedForm } from "@/components/ui/guided-form";

const ticketForm = (simple: boolean) => renderToStaticMarkup(createElement(TicketForm, {
  customers: [], assetsByCustomer: {}, techs: [], problemTypes: ["Screen"], simple,
}));
const documentForm = (simple: boolean) => renderToStaticMarkup(createElement(DocumentForm, {
  action: async () => ({ error: null }), kind: "invoice", customers: [], products: [], taxRateBps: 0, taxRates: [],
  submitLabel: "Save", cancelHref: "/invoices", simple,
}));
const savedDocumentForm = () => renderToStaticMarkup(createElement(DocumentForm, {
  action: async () => ({ error: null }), kind: "invoice", customers: [], products: [], taxRateBps: 0, taxRates: [],
  initial: { id: "inv_1" }, submitLabel: "Save", cancelHref: "/invoices", simple: true,
}));
const formTag = (html: string) => html.match(/<form[^>]*>/)?.[0] ?? "";

/** Runs the hook once and hands back the handlers it gives the <form>. */
function guidedHandlers(options: Parameters<typeof useGuidedForm>[0]) {
  let handlers!: ReturnType<typeof useGuidedForm>;
  renderToStaticMarkup(createElement(() => { handlers = useGuidedForm(options); return null; }));
  return handlers;
}
/** An Enter key in a text input, as the browser would deliver it to the form. */
function enterInTextInput() {
  const preventDefault = vi.fn();
  return { event: { key: "Enter", nativeEvent: { isComposing: false }, target: new HTMLInputElementStub(), preventDefault }, preventDefault };
}
class HTMLInputElementStub {}

describe("Full mode forms are plain browser forms", () => {
  beforeEach(() => { hook.calls.length = 0; });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the browser's own validation on the repair form (Easy mode replaces it)", () => {
    expect(formTag(ticketForm(false))).not.toMatch(/novalidate/i);
    expect(formTag(ticketForm(true))).toMatch(/novalidate/i);
  });

  it("keeps the browser's own validation on invoice and estimate forms (Easy mode replaces it)", () => {
    expect(formTag(documentForm(false))).not.toMatch(/novalidate/i);
    expect(formTag(documentForm(true))).toMatch(/novalidate/i);
  });

  it("only offers quick entry / step-by-step in Easy mode", () => {
    expect(documentForm(false)).not.toContain("Use step-by-step");
    // A new document in Easy mode is the bill builder, which has its own three steps (tests/bill-builder-render.test.ts);
    // the toggle stays on a saved document opened in Easy mode.
    expect(documentForm(true)).toContain("Invoice steps");
    expect(documentForm(true)).not.toContain("Use step-by-step");
    expect(savedDocumentForm()).toContain("Use step-by-step");
  });

  it("replaces the repair form's one-screen toggle with the check-in steps in Easy mode", () => {
    expect(ticketForm(false)).not.toContain("Use step-by-step");
    expect(ticketForm(true)).not.toContain("Use step-by-step");
    expect(ticketForm(true)).toContain("Check-in steps");
    expect(ticketForm(false)).not.toContain("Check-in steps");
  });

  it("hands Enter back to the browser in Full mode, and only takes it over in Easy mode", () => {
    for (const render of [ticketForm, documentForm]) {
      hook.calls.length = 0;
      render(false);
      expect(hook.calls.at(-1)).toEqual({ enabled: false, staged: false });
    }
    hook.calls.length = 0;
    savedDocumentForm(); // a saved document opened in Easy mode opens on one-screen quick entry
    expect(hook.calls.at(-1)).toEqual({ enabled: true, staged: false });
    // A new one is the bill builder, which has its own steps and its own Enter handling (tests/bill-builder-render.test.ts).
    hook.calls.length = 0;
    documentForm(true);
    expect(hook.calls).toEqual([]);
    // The repair check-in has its own steps and its own Enter handling (tests/checkin-render.test.ts).
    hook.calls.length = 0;
    ticketForm(true);
    expect(hook.calls).toEqual([]);
  });

  it("lets Enter submit a Full-mode form instead of swallowing it", () => {
    vi.stubGlobal("HTMLInputElement", HTMLInputElementStub);
    const { onKeyDown, onSubmit } = guidedHandlers({ enabled: false, steps: 3, validate: () => [] });
    const { event, preventDefault } = enterInTextInput();
    onKeyDown(event as never);
    onSubmit({ preventDefault } as never);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("still swallows Enter in Easy mode, where a scanner or keyboard must not save a document", () => {
    vi.stubGlobal("HTMLInputElement", HTMLInputElementStub);
    const { onKeyDown } = guidedHandlers({ enabled: true, staged: false, steps: 3, validate: () => [] });
    const { event, preventDefault } = enterInTextInput();
    onKeyDown(event as never);
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

describe("EntryMode toggle", () => {
  const render = (guided: boolean) => renderToStaticMarkup(createElement(EntryMode, { guided, onChange: () => {}, disabled: false }));

  it("names what tapping does, and does not also claim a pressed state", () => {
    expect(render(false)).toContain("Use step-by-step");
    expect(render(true)).toContain("Use quick entry");
    expect(render(false)).not.toContain("aria-pressed");
    expect(render(true)).not.toContain("aria-pressed");
  });
});

describe("guided form pieces follow the theme", () => {
  // Hard-coded white / blue / black stays bright or unreadable when the account menu switches to Dark.
  const fixed = /\b(?:bg-white|bg-black|text-white|(?:bg|text|border)-(?:blue|zinc)-\d+)\b|#[0-9a-f]{3,8}\b/i;

  it("uses theme tokens for the step bar, error box, review box and buttons", () => {
    const html = [
      renderToStaticMarkup(createElement(GuidedSteps, { labels: ["One", "Two", "Three"], step: 1, onStep: () => {} })),
      renderToStaticMarkup(createElement(GuidedErrors, { issues: [{ step: 0, field: "a", label: "A", message: "Bad" }], onFocus: () => {} })),
      renderToStaticMarkup(createElement(GuidedReview, { rows: [{ label: "A", value: "B" }] })),
      renderToStaticMarkup(GuidedNavigation({ step: 0, lastStep: 2, onStep: () => {}, children: "Save" })),
    ].join("\n");
    expect(html).not.toMatch(fixed);
    expect(html).toContain("bg-surface");
  });
});
