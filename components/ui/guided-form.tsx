"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

export type GuidedIssue = { step: number; field: string; label: string; message: string };
type Validator = (data: FormData, step: number) => GuidedIssue[];
type NativeField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Hidden stages stay mounted and enabled, so every field still posts normally. */
export function useGuidedForm({ enabled, steps, validate }: {
  enabled: boolean;
  steps: number;
  validate: Validator;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const bindForm = React.useCallback((form: HTMLFormElement | null) => { formRef.current = form; }, []);
  const [step, setStep] = React.useState(0);
  const [issues, setIssues] = React.useState<GuidedIssue[]>([]);
  const [review, setReview] = React.useState<FormData | null>(null);

  function collect(index: number): GuidedIssue[] {
    const form = formRef.current;
    if (!form) return [];
    const section = form.querySelector(`[data-guided-step="${index}"]`);
    const native: GuidedIssue[] = [];
    section?.querySelectorAll<NativeField>("input, select, textarea").forEach((field) => {
      if (!field.willValidate || field.checkValidity()) return;
      const label = field.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim()
        || field.getAttribute("aria-label") || field.name || "Field";
      native.push({ step: index, field: field.id || field.name || field.getAttribute("aria-label") || label, label, message: field.validationMessage });
    });
    const custom = validate(new FormData(form), index);
    return [...native, ...custom.filter((issue) => !native.some((item) => item.field === issue.field))];
  }

  function focusIssue(issue: GuidedIssue) {
    const form = formRef.current;
    if (!form) return;
    const element = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea, button"))
      .find((item) => item.id === issue.field || item.getAttribute("name") === issue.field || item.getAttribute("aria-label") === issue.field);
    const target = element instanceof HTMLInputElement && element.type === "hidden"
      ? form.querySelector<HTMLElement>(`[data-guided-step="${issue.step}"] input:not([type="hidden"]), [data-guided-step="${issue.step}"] button`)
      : element;
    if (!target) return;
    let parent = target.parentElement;
    while (parent && parent !== form) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    target.focus();
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      target.reportValidity();
    }
  }

  function fail(nextIssues: GuidedIssue[]) {
    setIssues(nextIssues);
    setStep(nextIssues[0].step);
    requestAnimationFrame(() => focusIssue(nextIssues[0]));
  }

  function goTo(next: number) {
    if (next > step) {
      const nextIssues = Array.from({ length: next - step }, (_, index) => collect(step + index)).flat();
      if (nextIssues.length) { fail(nextIssues); return; }
    }
    setIssues([]);
    setStep(next);
    if (next === steps - 1 && formRef.current) setReview(new FormData(formRef.current));
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[data-guided-heading]")?.focus());
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!enabled) return;
    if (step < steps - 1) { event.preventDefault(); goTo(step + 1); return; }
    const nextIssues = Array.from({ length: steps }, (_, index) => collect(index)).flat();
    if (nextIssues.length) { event.preventDefault(); fail(nextIssues); }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (!enabled || event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    // A barcode reader or an on-screen keyboard must never create a document.
    event.preventDefault();
    if (step < steps - 1) goTo(step + 1);
  }

  function refreshReview() {
    if (formRef.current) setReview(new FormData(formRef.current));
  }
  return { bindForm, step, issues, review, goTo, onSubmit, onKeyDown, focusIssue, refreshReview };
}

export function GuidedSteps({ labels, step, onStep, disabled = false }: { labels: string[]; step: number; onStep: (next: number) => void; disabled?: boolean }) {
  return <nav aria-label="Form progress" className="grid grid-cols-3 gap-2">
    {labels.map((label, index) => <button key={label} type="button" disabled={disabled} onClick={() => onStep(index)}
      aria-current={index === step ? "step" : undefined}
      className={cn("flex min-h-16 min-w-0 flex-col items-start gap-2 rounded-lg border bg-white px-3 py-3 text-left text-sm font-semibold sm:flex-row sm:items-center sm:gap-3 sm:px-4",
        index === step ? "border-blue-600 text-blue-700" : "border-border text-muted-foreground")}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm", index <= step ? "bg-blue-600 text-white" : "bg-surface-hover text-muted-foreground")}>
        {index < step ? <Check className="size-4" aria-hidden /> : index + 1}
      </span><span className="min-w-0 break-words">{label}</span>
    </button>)}
  </nav>;
}

export function GuidedErrors({ issues, step, onFocus }: { issues: GuidedIssue[]; step: number; onFocus: (issue: GuidedIssue) => void }) {
  const active = issues.filter((issue) => issue.step === step);
  if (!active.length) return null;
  return <div role="alert" className="rounded-lg border border-destructive/40 bg-white p-4 text-sm text-destructive">
    <p className="font-semibold">Check these details before continuing</p>
    <ul className="mt-1 space-y-1">{active.map((issue, index) => <li key={issue.field + index}>
      <button type="button" onClick={() => onFocus(issue)} className="min-h-12 text-left underline underline-offset-2"><strong>{issue.label}:</strong> {issue.message}</button>
    </li>)}</ul>
  </div>;
}

export function GuidedNavigation({ step, lastStep, onStep, children, disabled = false }: {
  step: number; lastStep: number; onStep: (next: number) => void; children: React.ReactNode; disabled?: boolean;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
    <div>{step > 0 ? <Button type="button" variant="outline" className="min-h-12 px-5" disabled={disabled} onClick={() => onStep(step - 1)}><ChevronLeft /> Back</Button> : null}</div>
    <div className="flex items-center gap-3">{children}{step < lastStep ? <Button type="button" className="min-h-12 bg-black px-6 text-white hover:bg-zinc-800" disabled={disabled} onClick={() => onStep(step + 1)}>Continue <ChevronRight /></Button> : null}</div>
  </div>;
}

export function GuidedReview({ rows, className }: { rows: { label: string; value: React.ReactNode }[]; className?: string }) {
  return <dl className={cn("divide-y divide-border rounded-lg border border-border bg-white px-4", className)}>
    {rows.map((row) => <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{row.label}</dt><dd className="break-words text-sm font-semibold">{row.value || "Not entered"}</dd>
    </div>)}
  </dl>;
}
